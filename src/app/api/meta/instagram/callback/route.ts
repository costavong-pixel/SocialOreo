import { NextRequest, NextResponse } from "next/server";

import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db/prisma";
import { exchangeInstagramAuthorizationCode, getInstagramProfessionalProfile } from "@/lib/instagram-insights/client";
import { getInstagramInsightsConfig } from "@/lib/instagram-insights/config";
import { verifyInstagramOAuthState } from "@/lib/instagram-insights/oauth";
import { encryptInstagramToken } from "@/lib/instagram-insights/token-crypto";

function dashboardUrl(request: NextRequest, state: string) {
  return new URL(`/dashboard?instagram=${state}`, request.url);
}

export async function GET(request: NextRequest) {
  const authUser = await getVerifiedSessionUser();
  const config = getInstagramInsightsConfig();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!authUser || !config || !code) return NextResponse.redirect(dashboardUrl(request, "failed"));
  const user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
  const validState = verifyInstagramOAuthState(request.cookies.get("socialoreo_meta_oauth")?.value, state, user.id);
  if (!validState) return NextResponse.redirect(dashboardUrl(request, "invalid_state"));
  try {
    const token = await exchangeInstagramAuthorizationCode(config, code);
    const profile = await getInstagramProfessionalProfile(config, token.access_token);
    const tokenExpiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
    await prisma.instagramInsightsConnection.upsert({
      where: { userId: user.id },
      update: { instagramUserId: profile.id, username: profile.username, accountType: profile.account_type, tokenCiphertext: encryptInstagramToken(token.access_token, config.tokenEncryptionKey), tokenExpiresAt, scopes: ["instagram_business_basic", "instagram_business_manage_insights"], status: "CONNECTED", lastError: null },
      create: { userId: user.id, instagramUserId: profile.id, username: profile.username, accountType: profile.account_type, tokenCiphertext: encryptInstagramToken(token.access_token, config.tokenEncryptionKey), tokenExpiresAt, scopes: ["instagram_business_basic", "instagram_business_manage_insights"] },
    });
    const response = NextResponse.redirect(dashboardUrl(request, "connected"));
    response.cookies.delete("socialoreo_meta_oauth");
    return response;
  } catch {
    return NextResponse.redirect(dashboardUrl(request, "failed"));
  }
}
