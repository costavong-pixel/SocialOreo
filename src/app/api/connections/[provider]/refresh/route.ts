import { NextRequest, NextResponse } from "next/server";
import { getAcceptedSessionUser } from "@/lib/auth/current-user";
import { isAuthIdentityCollisionError, syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { connectionAvailable, refreshConnection } from "@/lib/socialolla/connections/service";

function sameOrigin(request: NextRequest): boolean {
  const configured = process.env.APP_URL ?? process.env.APP_BASE_URL;
  const expected = new URL(configured ?? request.url).origin;
  return request.headers.get("origin") === expected;
}

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  if (!connectionAvailable(provider)) return NextResponse.redirect(new URL(`/connections?${encodeURIComponent(provider)}=unavailable`, request.url));
  const session = await getAcceptedSessionUser();
  if (!session) return NextResponse.redirect(new URL("/auth/login", request.url));
  const form = await request.formData();
  const destinationExternalId = String(form.get("destinationExternalId") ?? "");
  if (!destinationExternalId) return NextResponse.redirect(new URL(`/connections?${encodeURIComponent(provider)}=reauth_required`, request.url));
  let user: { id: string };
  try {
    user = await syncUserFromAuth0({ id: session.id, email: session.email });
  } catch (error) {
    if (isAuthIdentityCollisionError(error)) return NextResponse.redirect(new URL(`/connections?${encodeURIComponent(provider)}=identity_conflict`, request.url));
    throw error;
  }
  const refreshed = await refreshConnection({ userId: user.id, platform: provider, destinationExternalId });
  return NextResponse.redirect(new URL(`/connections?${encodeURIComponent(provider)}=${refreshed.state === "REAUTH_REQUIRED" ? "reauth_required" : "refreshed"}`, request.url));
}
