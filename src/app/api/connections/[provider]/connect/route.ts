import { NextRequest, NextResponse } from "next/server";
import { getAcceptedSessionUser } from "@/lib/auth/current-user";
import { isAuthIdentityCollisionError, syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { connectionAvailable, connectionConfiguration } from "@/lib/socialolla/connections/service";
import { createPendingOAuthState } from "@/lib/socialolla/connections/oauth-state";

function resultRedirect(request: NextRequest, provider: string, result: string) {
  return NextResponse.redirect(new URL(`/connections?${encodeURIComponent(provider)}=${encodeURIComponent(result)}`, request.url));
}
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const normalized = provider.trim().toLowerCase();
  const session = await getAcceptedSessionUser();
  if (!session) return NextResponse.redirect(new URL("/auth/login", request.url));
  if (!connectionAvailable(normalized)) return resultRedirect(request, normalized, "unavailable");
  const configuration = (() => { try { return connectionConfiguration(normalized); } catch { return null; } })();
  if (!configuration) return resultRedirect(request, normalized, "unavailable");
  let user: { id: string };
  try {
    user = await syncUserFromAuth0({ id: session.id, email: session.email });
  } catch (error) {
    if (isAuthIdentityCollisionError(error)) return resultRedirect(request, normalized, "identity_conflict");
    throw error;
  }
  const state = await createPendingOAuthState({ userId: user.id, provider: configuration.platform, redirectUri: configuration.redirectUri, supportsPkce: configuration.adapter.supportsPkce });
  const authorize = configuration.adapter.authorizationUrl({ clientId: configuration.client.clientId, redirectUri: configuration.redirectUri, state: state.state, codeChallenge: state.codeChallenge ?? undefined });
  return NextResponse.redirect(authorize);
}
