import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { isAuthIdentityCollisionError, syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { verifyInstagramOAuthState } from "@/lib/instagram-insights/oauth";
import { encryptInstagramToken } from "@/lib/instagram-insights/token-crypto";
import { assertProfessionalAccount, exchangeInstagramPublishingAuthorizationCode, getInstagramPublishingProfile, verifyInstagramPublishingEligibility } from "@/lib/instagram-publishing/client";
import { getInstagramPublishingConfig, INSTAGRAM_PUBLISHING_SCOPES } from "@/lib/instagram-publishing/config";

function redirect(request: NextRequest, result: string) {
  const response = NextResponse.redirect(new URL(`/connections?instagram=${encodeURIComponent(result)}`, request.url));
  response.cookies.delete("socialoreo_instagram_publish_oauth");
  return response;
}

export async function GET(request: NextRequest) {
  const authUser = await getVerifiedSessionUser();
  const config = getInstagramPublishingConfig();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!authUser || !config || !code) return redirect(request, "failed");
  let user: { id: string };
  try {
    user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
  } catch (error) {
    if (isAuthIdentityCollisionError(error)) return redirect(request, "identity_conflict");
    throw error;
  }
  if (!verifyInstagramOAuthState(request.cookies.get("socialoreo_instagram_publish_oauth")?.value, state, user.id)) return redirect(request, "invalid_state");
  try {
    const token = await exchangeInstagramPublishingAuthorizationCode(config, code);
    const profile = await getInstagramPublishingProfile(config, token.access_token);
    assertProfessionalAccount(profile.account_type);
    await verifyInstagramPublishingEligibility(config, profile.id, token.access_token);
    const workspace = await getOrCreatePersonalWorkspace(user.id);
    const tokenExpiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
    const providerDisabled = process.env.SOCIALOLLA_PROVIDER_DISABLED === "true" || process.env.SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED !== "true";
    const publishingEligibilityVerifiedAt = new Date();
    const current = await prisma.destination.findFirst({ where: { workspaceId: workspace.dbId, platform: "instagram", platformUserId: profile.id } });
    if (current) {
      await prisma.destination.update({ where: { id: current.id }, data: { label: profile.username ? `@${profile.username}` : "Instagram", accountLabel: profile.username ? `@${profile.username}` : profile.id, platformUserId: profile.id, status: "CONNECTED", providerDisabled, accessTokenCiphertext: encryptInstagramToken(token.access_token, config.tokenEncryptionKey), accessTokenExpiresAt: tokenExpiresAt, publishingEligibilityVerifiedAt, scopes: [...INSTAGRAM_PUBLISHING_SCOPES] } });
    } else {
      await prisma.destination.create({ data: { externalId: `dst_${randomBytes(12).toString("base64url")}`, workspaceId: workspace.dbId, label: profile.username ? `@${profile.username}` : "Instagram", accountLabel: profile.username ? `@${profile.username}` : profile.id, platform: "instagram", platformUserId: profile.id, status: "CONNECTED", providerDisabled, accessTokenCiphertext: encryptInstagramToken(token.access_token, config.tokenEncryptionKey), accessTokenExpiresAt: tokenExpiresAt, publishingEligibilityVerifiedAt, scopes: [...INSTAGRAM_PUBLISHING_SCOPES] } });
    }
    return redirect(request, providerDisabled ? "connected_provider_disabled" : "connected");
  } catch (error) {
    return redirect(request, error instanceof Error && error.message.includes("professional") ? "ineligible" : "failed");
  }
}
