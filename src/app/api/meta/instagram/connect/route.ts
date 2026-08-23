import { NextResponse } from "next/server";

import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { isAuthIdentityCollisionError, syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getInstagramInsightsConfig } from "@/lib/instagram-insights/config";
import { createInstagramOAuthState } from "@/lib/instagram-insights/oauth";

export async function GET() {
  const authUser = await getVerifiedSessionUser();
  if (!authUser) return NextResponse.redirect(new URL("/auth/login", process.env.APP_URL));
  const config = getInstagramInsightsConfig();
  if (!config) return NextResponse.redirect(new URL("/analysis?instagram=unavailable", process.env.APP_URL));
  let user: { id: string };
  try {
    user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
  } catch (error) {
    if (isAuthIdentityCollisionError(error)) {
      return NextResponse.redirect(new URL("/analysis?instagram=identity_conflict", process.env.APP_URL));
    }

    throw error;
  }
  const { state, cookieValue } = createInstagramOAuthState(user.id);
  const authorize = new URL("https://www.instagram.com/oauth/authorize");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_insights");
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set("socialoreo_meta_oauth", cookieValue, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return response;
}
