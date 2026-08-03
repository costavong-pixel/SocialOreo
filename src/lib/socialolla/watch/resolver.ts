import { prisma } from "@/lib/db/prisma";
import { resolveWatchCompetitorLimit, watchConfig } from "./config";

/**
 * Resolve the effective Watch competitor cap for a user's personal workspace.
 *
 * Provider-disabled by default: with configurable entitlements disabled this
 * falls back to the existing plan-based limit exactly, preserving PR #4
 * behavior (ownership, opt-in, cancellation, retries, evidence untouched).
 */
export async function watchCompetitorLimitForUser(ownerUserId: string): Promise<number> {
  const config = watchConfig();
  let snapshotLimit: number | null = null;
  if (config.configurableEntitlementsEnabled) {
    const snapshot = await prisma.entitlementSnapshot.findFirst({
      where: { workspace: { ownerUserId } },
      orderBy: { validFrom: "desc" },
    });
    snapshotLimit = snapshot?.maxWatchCompetitors ?? null;
  }

  const account = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { accessPlan: true },
  });
  const plan = (account?.accessPlan ?? "NONE") as "NONE" | "LIFETIME" | "MONTHLY";
  return resolveWatchCompetitorLimit(snapshotLimit, plan, config.hardMaxCompetitors);
}
