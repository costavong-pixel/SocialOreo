import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { isAuthIdentityCollisionError, syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getInstagramPublishingConfig, INSTAGRAM_PUBLISHING_SCOPES } from "@/lib/instagram-publishing/config";
import { createInstagramOAuthState } from "@/lib/instagram-insights/oauth";

export async function GET(request: NextRequest) {
  const authUser = await getVerifiedSessionUser();
  if (!authUser) return NextResponse.redirect(new URL("/auth/login", request.url));
  const config = getInstagramPublishingConfig();
  if (!config) return NextResponse.redirect(new URL("/connections?instagram=unavailable", request.url));
  let user: { id: string };
  try {
    user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
  } catch (error) {
    if (isAuthIdentityCollisionError(error)) return NextResponse.redirect(new URL("/connections?instagram=identity_conflict", request.url));
    throw error;
  }
  const { state, cookieValue } = createInstagramOAuthState(user.id);
  const authorize = new URL("https://www.instagram.com/oauth/authorize");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", INSTAGRAM_PUBLISHING_SCOPES.join(","));
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set("socialoreo_instagram_publish_oauth", cookieValue, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return response;
}
