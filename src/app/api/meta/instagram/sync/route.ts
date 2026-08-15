import { NextRequest, NextResponse } from "next/server";

import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { isAuthIdentityCollisionError, syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db/prisma";
import { fetchInstagramAccountInsights } from "@/lib/instagram-insights/client";
import { getInstagramInsightsConfig } from "@/lib/instagram-insights/config";
import { decryptInstagramToken } from "@/lib/instagram-insights/token-crypto";

function redirectToDashboard(request: NextRequest, state: string) {
  return NextResponse.redirect(new URL(`/dashboard?instagram=${state}`, request.url), { status: 303 });
}

export async function POST(request: NextRequest) {
  const authUser = await getVerifiedSessionUser();
  const config = getInstagramInsightsConfig();
  if (!authUser || !config) return redirectToDashboard(request, "unavailable");
  let user: { id: string };
  try {
    user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
  } catch (error) {
    if (isAuthIdentityCollisionError(error)) return redirectToDashboard(request, "identity_conflict");
    throw error;
  }
  const connection = await prisma.instagramInsightsConnection.findUnique({ where: { userId: user.id } });
  if (!connection || connection.status !== "CONNECTED") return redirectToDashboard(request, "reconnect");
  try {
    const insight = await fetchInstagramAccountInsights(config, connection.instagramUserId, decryptInstagramToken(connection.tokenCiphertext, config.tokenEncryptionKey));
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.instagramInsightsSnapshot.upsert({
        where: { connectionId_periodStart_periodEnd: { connectionId: connection.id, periodStart, periodEnd } },
        update: { ...insight, fetchedAt: periodEnd },
        create: { connectionId: connection.id, periodStart, periodEnd, ...insight },
      }),
      prisma.instagramInsightsConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: periodEnd, lastError: null } }),
    ]);
    return redirectToDashboard(request, "synced");
  } catch {
    await prisma.instagramInsightsConnection.update({ where: { id: connection.id }, data: { status: "REAUTH_REQUIRED", lastError: "The Meta Insights sync did not complete. Reconnect the professional account and try again." } });
    return redirectToDashboard(request, "sync_failed");
  }
}
