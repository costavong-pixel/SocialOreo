import { NextRequest, NextResponse } from "next/server";
import { getAcceptedSessionUser } from "@/lib/auth/current-user";
import { isAuthIdentityCollisionError, syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { connectionAvailable, connectionConfiguration } from "@/lib/socialolla/connections/service";
import { consumePendingOAuthState } from "@/lib/socialolla/connections/oauth-state";
import { saveConnection } from "@/lib/socialolla/connections/service";

function redirect(request: NextRequest, provider: string, result: string) {
  const base = (process.env.APP_URL ?? process.env.APP_BASE_URL)?.replace(/\/$/, "");
  return NextResponse.redirect(new URL(`/connections?${encodeURIComponent(provider)}=${encodeURIComponent(result)}`, base || request.url));
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const normalized = provider.trim().toLowerCase();
  const session = await getAcceptedSessionUser();
  if (!session) return redirect(request, normalized, "failed");
  const configuration = (() => { try { return connectionConfiguration(normalized); } catch { return null; } })();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!configuration || !code || !state) return redirect(request, normalized, "failed");
  if (request.nextUrl.searchParams.has("error")) return redirect(request, normalized, "failed");
  let user: { id: string };
  try {
    user = await syncUserFromAuth0({ id: session.id, email: session.email });
  } catch (error) {
    if (isAuthIdentityCollisionError(error)) return redirect(request, normalized, "identity_conflict");
    throw error;
  }
  const pending = await consumePendingOAuthState({ state, userId: user.id, provider: configuration.platform, redirectUri: configuration.redirectUri });
  if (!pending) return redirect(request, normalized, "invalid_state");
  if (!connectionAvailable(configuration.platform)) return redirect(request, normalized, "unavailable");
  try {
    const token = await configuration.adapter.exchangeCallback({ clientId: configuration.client.clientId, clientSecret: configuration.client.clientSecret, code, redirectUri: configuration.redirectUri, codeVerifier: pending.codeVerifier ?? undefined });
    if (!connectionAvailable(configuration.platform)) return redirect(request, normalized, "unavailable");
    const destinations = await configuration.adapter.discoverDestinations({ token });
    if (!connectionAvailable(configuration.platform)) return redirect(request, normalized, "unavailable");
    await saveConnection({ userId: user.id, platform: configuration.platform, token, destinations });
    return redirect(request, normalized, "connected");
  } catch {
    return redirect(request, normalized, "reauth_required");
  }
}
