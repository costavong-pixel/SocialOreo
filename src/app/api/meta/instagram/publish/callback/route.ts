import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAcceptedSessionUser } from "@/lib/auth/current-user";
import { isAuthIdentityCollisionError, syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { verifyInstagramOAuthState } from "@/lib/instagram-insights/oauth";
import { encryptInstagramToken } from "@/lib/instagram-insights/token-crypto";
import { assertProfessionalAccount, exchangeInstagramPublishingAuthorizationCode, getInstagramPublishingProfile, verifyInstagramPublishingEligibility } from "@/lib/instagram-publishing/client";
import { getInstagramPublishingConfig, INSTAGRAM_PUBLISHING_SCOPES } from "@/lib/instagram-publishing/config";
import { instagramPublishingOAuthEnabled } from "@/lib/socialolla/publishing/provider";

function redirect(request: NextRequest, result: string) {
  const response = NextResponse.redirect(new URL(`/connections?instagram=${encodeURIComponent(result)}`, request.url));
  response.cookies.delete("socialoreo_instagram_publish_oauth");
  return response;
}

export async function GET(request: NextRequest) {
  const authUser = await getAcceptedSessionUser();
  if (!instagramPublishingOAuthEnabled()) return redirect(request, "unavailable");
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
    const providerDisabled = false;
    const publishingEligibilityVerifiedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const current = await tx.destination.findFirst({ where: { workspaceId: workspace.dbId, platform: "instagram", platformUserId: profile.id } });
      const destinationData = { label: profile.username ? `@${profile.username}` : "Instagram", accountLabel: profile.username ? `@${profile.username}` : profile.id, platformUserId: profile.id, status: "CONNECTED" as const, providerDisabled, accessTokenCiphertext: encryptInstagramToken(token.access_token, config.tokenEncryptionKey), accessTokenExpiresAt: tokenExpiresAt, publishingEligibilityVerifiedAt, scopes: [...INSTAGRAM_PUBLISHING_SCOPES] };
      if (current) {
        await tx.destination.update({ where: { id: current.id }, data: destinationData });
        return;
      }
      const entitlement = await tx.entitlementSnapshot.findFirst({ where: { workspaceId: workspace.dbId }, orderBy: { validFrom: "desc" }, select: { maxDestinations: true } });
      const maxDestinations = Math.max(0, entitlement?.maxDestinations ?? 1);
      const destinationCount = await tx.destination.count({ where: { workspaceId: workspace.dbId } });
      if (destinationCount >= maxDestinations) throw new Error("Destination limit reached for this plan.");
      await tx.destination.create({ data: { externalId: `dst_${randomBytes(12).toString("base64url")}`, workspaceId: workspace.dbId, platform: "instagram", ...destinationData } });
    }, { isolationLevel: "Serializable" });
    return redirect(request, providerDisabled ? "connected_provider_disabled" : "connected");
  } catch (error) {
    if (error instanceof Error && error.message === "Destination limit reached for this plan.") return redirect(request, "limit_reached");
    return redirect(request, error instanceof Error && error.message.includes("professional") ? "ineligible" : "failed");
  }
}
