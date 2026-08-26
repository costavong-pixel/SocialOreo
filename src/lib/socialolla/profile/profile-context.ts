import { AccessPlan, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { accountSupportReference } from "@/lib/auth/support-reference";
import { loadStagingAcceptanceProfileState, type StagingAcceptanceProfileState } from "@/lib/auth/staging-acceptance";

export type ProfileSession = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName?: string | null;
};

export type ProfileConnection = {
  platform: "Instagram" | "TikTok";
  status: "Connected" | "Needs reconnect" | "Not connected" | "Not available in staging";
};

export type ProfileContext = {
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  authProvider: "Auth0";
  acceptanceBootstrapState: StagingAcceptanceProfileState;
  role: UserRole | null;
  supportReference: string;
  workspaceLabel: string | null;
  plan: string;
  creditBalance: number;
  connections: ProfileConnection[];
  locale: string | null;
  timezone: string | null;
  environment: "Staging" | "Production" | "Development";
  providerMode: "Disabled" | "Sandbox" | "Live";
};

function planLabel(accessPlan: AccessPlan | null | undefined, entitlementName: string | null | undefined): string {
  if (entitlementName) return entitlementName;
  if (!accessPlan || accessPlan === AccessPlan.NONE) return "No active plan";
  return accessPlan.charAt(0) + accessPlan.slice(1).toLowerCase();
}

function connectionStatus(status: string | null | undefined): ProfileConnection["status"] {
  if (status === "CONNECTED") return "Connected";
  if (status === "REAUTH_REQUIRED") return "Needs reconnect";
  return "Not connected";
}

function runtimeEnvironment(): ProfileContext["environment"] {
  const configured = process.env.SOCIALOLLA_ENV?.trim().toLowerCase();
  if (configured === "staging") return "Staging";
  if (configured === "production") return "Production";
  return process.env.NODE_ENV === "production" ? "Production" : "Development";
}

function runtimeProviderMode(): ProfileContext["providerMode"] {
  if (providerDisabledEnabled()) return "Disabled";
  return process.env.SQUARE_ENV?.trim().toLowerCase() === "sandbox" ? "Sandbox" : "Live";
}

/**
 * Read-only account context. A verified session may pass its resolved DB id;
 * an unverified session is allowed to read only its own existing row, without
 * triggering Auth0 sync or workspace creation.
 */
export async function loadProfileContext(session: ProfileSession, dbUserId?: string): Promise<ProfileContext> {
  const user = await prisma.user.findUnique({
    where: dbUserId ? { id: dbUserId } : { authUserId: session.id },
    select: {
      id: true,
      role: true,
      accessPlan: true,
      instagramInsightsConnection: { select: { status: true } },
      workspaces: {
        take: 1,
        select: {
          label: true,
          defaultLocale: true,
          destinations: {
            select: { platform: true, status: true },
            orderBy: { createdAt: "asc" },
          },
          entitlementSnapshots: {
            take: 1,
            orderBy: { validFrom: "desc" },
            select: { planVersion: { select: { name: true } } },
          },
          creditBatches: {
            select: { kind: true, remaining: true, periodKey: true, expiresAt: true },
          },
        },
      },
    },
  });

  const workspace = user?.workspaces[0] ?? null;
  const acceptanceBootstrapState = await loadStagingAcceptanceProfileState(session.id, session.email);
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const creditBalance = workspace?.creditBatches.reduce((total, batch) => {
    const currentMonthly = batch.kind === "MONTHLY" && batch.periodKey === currentPeriod;
    const currentPurchased = batch.kind === "PURCHASED" && (batch.expiresAt === null || batch.expiresAt > now);
    return currentMonthly || currentPurchased ? total + Math.max(0, batch.remaining) : total;
  }, 0) ?? 0;
  const destinationFor = (platform: string) =>
    workspace?.destinations.find((destination) => destination.platform.toLowerCase() === platform) ?? null;

  const instagramDestination = destinationFor("instagram");
  const tiktokDestination = destinationFor("tiktok");
  const instagramStatus = instagramDestination
    ? connectionStatus(instagramDestination.status)
    : connectionStatus(user?.instagramInsightsConnection?.status);

  return {
    displayName: session.displayName ?? null,
    email: session.email,
    emailVerified: session.emailVerified,
    authProvider: "Auth0",
    acceptanceBootstrapState,
    role: user?.role ?? null,
    supportReference: accountSupportReference(user?.id ?? session.id),
    workspaceLabel: workspace?.label ?? null,
    plan: planLabel(user?.accessPlan, workspace?.entitlementSnapshots[0]?.planVersion.name),
    creditBalance,
    connections: [
      { platform: "Instagram", status: instagramStatus },
      {
        platform: "TikTok",
        status: tiktokDestination ? connectionStatus(tiktokDestination.status) : "Not available in staging",
      },
    ],
    locale: workspace?.defaultLocale ?? null,
    timezone: null,
    environment: runtimeEnvironment(),
    providerMode: runtimeProviderMode(),
  };
}
