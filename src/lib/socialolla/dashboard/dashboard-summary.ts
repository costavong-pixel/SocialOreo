import { prisma } from "@/lib/db/prisma";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";

export type DashboardCardState = "REAL" | "PARTIAL" | "UI_ONLY" | "DISABLED";

export interface DashboardSummary {
  providerDisabled: boolean;
  overallState: DashboardCardState;
  recommendedAction: {
    title: string;
    description: string;
    href: string;
  };
  analysis: {
    state: DashboardCardState;
    count: number;
    latest: {
      id: string;
      label: string;
      score: number | null;
      completedAt: Date | null;
    } | null;
  };
  posts: {
    state: DashboardCardState;
    total: number;
    draft: number;
    scheduled: number;
    failed: number;
    latest: Array<{
      id: string;
      externalId: string;
      status: string;
      destinationRef: string;
      createdAt: Date;
    }>;
  };
  watch: {
    state: DashboardCardState;
    activeMonitors: number;
    totalMonitors: number;
    reports: number;
    latestReport: {
      externalId: string;
      platform: string;
      status: string;
      createdAt: Date;
    } | null;
    nextCaptureAt: Date | null;
  };
  connections: {
    state: DashboardCardState;
    total: number;
    connected: number;
    reconnectRequired: number;
    destinations: Array<{
      externalId: string;
      label: string;
      platform: string;
      status: string;
      providerDisabled: boolean;
    }>;
    instagramInsights: {
      status: string;
      username: string | null;
      lastSyncedAt: Date | null;
      lastError: string | null;
    } | null;
  };
  credits: {
    state: DashboardCardState;
    canonicalAvailable: number;
    canonicalBatchCount: number;
    legacyBalance: number | null;
    plan: string;
    planVersion: string | null;
    recentActivity: Array<{
      kind: string;
      amount: number;
      reference: string;
      createdAt: Date;
    }>;
  };
  upcoming: Array<{
    id: string;
    postRequestId: string;
    destinationRef: string;
    scheduleAt: Date;
    timezone: string;
  }>;
}

function analysisLabel(profileUrl: string, username: string | null | undefined): string {
  return username ? `@${username}` : profileUrl;
}

export async function loadDashboardSummary(dbUserId: string, workspaceDbId: string): Promise<DashboardSummary> {
  const providerDisabled = providerDisabledEnabled();

  const [
    user,
    destinations,
    posts,
    upcoming,
    analyses,
    watchReports,
    monitors,
    creditBatches,
    creditTransactions,
    entitlement,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: dbUserId },
      select: {
        accessPlan: true,
        creditAccount: { select: { balance: true } },
        instagramInsightsConnection: {
          select: { status: true, username: true, lastSyncedAt: true, lastError: true },
        },
      },
    }),
    prisma.destination.findMany({
      where: { workspaceId: workspaceDbId },
      select: { externalId: true, label: true, platform: true, status: true, providerDisabled: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.postRequest.findMany({
      where: { workspaceId: workspaceDbId },
      select: { id: true, externalId: true, status: true, destinationRef: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.scheduleSlot.findMany({
      where: { workspaceId: workspaceDbId, scheduleAt: { gte: new Date() } },
      select: { id: true, postRequestId: true, destinationRef: true, scheduleAt: true, timezone: true },
      orderBy: { scheduleAt: "asc" },
      take: 5,
    }),
    prisma.auditJob.findMany({
      where: { userId: dbUserId, status: "COMPLETED" },
      select: {
        id: true,
        profileUrl: true,
        completedAt: true,
        auditReport: { select: { overallScore: true } },
        socialProfiles: { select: { username: true }, take: 1 },
      },
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
    prisma.watchReport.findMany({
      where: { workspaceId: workspaceDbId },
      select: { externalId: true, platform: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.publicProfileMonitor.findMany({
      where: { userId: dbUserId },
      select: {
        enabled: true,
        nextCaptureAt: true,
        snapshots: { select: { capturedAt: true }, orderBy: { capturedAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
    prisma.creditBatch.findMany({
      where: { workspaceId: workspaceDbId },
      select: { kind: true, remaining: true, periodKey: true, expiresAt: true },
    }),
    prisma.creditTransaction.findMany({
      where: { batch: { workspaceId: workspaceDbId } },
      select: { kind: true, amount: true, reference: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.entitlementSnapshot.findFirst({
      where: { workspaceId: workspaceDbId },
      select: { planVersion: { select: { name: true } } },
      orderBy: { validFrom: "desc" },
    }),
  ]);

  const activeMonitors = monitors.filter((monitor) => monitor.enabled).length;
  const nextCaptureAt = monitors
    .map((monitor) => monitor.nextCaptureAt)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const draft = posts.filter((post) => post.status === "REVIEW" || post.status === "PENDING").length;
  const scheduled = posts.filter((post) => post.status === "SCHEDULED").length;
  const failed = posts.filter((post) => post.status === "FAILED").length;
  const connected = destinations.filter((destination) => destination.status === "CONNECTED").length;
  const reconnectRequired = destinations.filter((destination) => destination.status === "REAUTH_REQUIRED").length;
  const currentPeriod = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const canonicalAvailable = creditBatches.reduce((total, batch) => {
    const spendable = batch.kind === "MONTHLY"
      ? batch.periodKey === currentPeriod
      : batch.kind === "PURCHASED" && (batch.expiresAt === null || batch.expiresAt > new Date());
    return spendable ? total + Math.max(0, batch.remaining) : total;
  }, 0);
  const completedAnalyses = analyses.filter((analysis) => analysis.auditReport !== null);
  const latestAnalysis = completedAnalyses[0] ?? null;
  const latestReport = watchReports[0] ?? null;

  let recommendedAction: DashboardSummary["recommendedAction"];
  if (destinations.length === 0) {
    recommendedAction = {
      title: "Connect a sandbox destination",
      description: "Add a provider-disabled Instagram or TikTok destination before creating a Post.",
      href: "/connections",
    };
  } else if (posts.length === 0) {
    recommendedAction = {
      title: "Create your first Post draft",
      description: "Build a destination-specific draft. Live publishing remains disabled in this environment.",
      href: "/posts",
    };
  } else if (completedAnalyses.length === 0) {
    recommendedAction = {
      title: "Run Profile Analysis",
      description: "Review a public profile and keep the resulting evidence in Analysis.",
      href: "/analysis/new",
    };
  } else {
    recommendedAction = {
      title: "Review your workspace activity",
      description: "Check upcoming Posts, saved analyses, and Watch results from the canonical product areas.",
      href: "/calendar",
    };
  }

  return {
    providerDisabled,
    overallState: "PARTIAL",
    recommendedAction,
    analysis: {
      state: "PARTIAL",
      count: completedAnalyses.length,
      latest: latestAnalysis
        ? {
            id: latestAnalysis.id,
            label: analysisLabel(latestAnalysis.profileUrl, latestAnalysis.socialProfiles[0]?.username),
            score: latestAnalysis.auditReport?.overallScore ?? null,
            completedAt: latestAnalysis.completedAt,
          }
        : null,
    },
    posts: {
      state: "PARTIAL",
      total: posts.length,
      draft,
      scheduled,
      failed,
      latest: posts,
    },
    watch: {
      state: providerDisabled ? "DISABLED" : "PARTIAL",
      activeMonitors,
      totalMonitors: monitors.length,
      reports: watchReports.length,
      latestReport,
      nextCaptureAt,
    },
    connections: {
      state: destinations.length > 0 ? "PARTIAL" : "UI_ONLY",
      total: destinations.length,
      connected,
      reconnectRequired,
      destinations,
      instagramInsights: user?.instagramInsightsConnection ?? null,
    },
    credits: {
      state: "PARTIAL",
      canonicalAvailable,
      canonicalBatchCount: creditBatches.length,
      legacyBalance: user?.creditAccount?.balance ?? null,
      plan: user?.accessPlan ?? "NONE",
      planVersion: entitlement?.planVersion.name ?? null,
      recentActivity: creditTransactions,
    },
    upcoming,
  };
}
