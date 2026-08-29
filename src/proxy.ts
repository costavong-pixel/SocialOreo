import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth/auth0";

const DEMO_VISITOR_COOKIE = "so_demo_visitor";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSign(value: string): Promise<string> {
  const secret = process.env.DEMO_VISITOR_SECRET ?? process.env.AUTH0_SECRET;
  if (!secret) throw new Error("Demo visitor signing requires DEMO_VISITOR_SECRET or AUTH0_SECRET.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(sig)).slice(0, 22);
}

export async function proxy(request: NextRequest) {
  // Issue the one-per-visitor demo cookie during the /demo GET (middleware,
  // before the page renders). Doing this here instead of inside a Server Action
  // avoids the full re-navigation that a cookie-mutating action would trigger,
  // which would otherwise discard the freshly-returned demo result.
  if (request.nextUrl.pathname === "/demo" && request.method === "GET" && !request.cookies.get(DEMO_VISITOR_COOKIE)) {
    const token = crypto.randomUUID().replace(/-/g, "");
    const sig = await hmacSign(token);
    const next = NextResponse.next({ request });
    next.cookies.set(DEMO_VISITOR_COOKIE, `${token}.${sig}`, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production" || ["staging", "production"].includes(process.env.SOCIALOLLA_ENV?.trim().toLowerCase() ?? ""),
    });
    return next;
  }
  return await auth0.middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
