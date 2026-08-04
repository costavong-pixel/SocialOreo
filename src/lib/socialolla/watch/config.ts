import { WATCH_MAX_COMPETITORS } from "@/lib/snapshots/watch-policy";
import { competitorLimitForPlan, type SocialOreoAccessPlan } from "@/lib/competitors/entitlements";

export interface WatchConfig {
  configurableEntitlementsEnabled: boolean;
  hardMaxCompetitors: number;
}

export function watchConfig(): WatchConfig {
  return {
    configurableEntitlementsEnabled: process.env.SOCIALOLLA_WATCH_CONFIG_ENABLED === "true",
    hardMaxCompetitors: WATCH_MAX_COMPETITORS,
  };
}

/**
 * Resolve the Watch competitor cap for a workspace.
 *
 * - A configured entitlement snapshot may raise or lower the per-workspace cap.
 * - The hard safety boundary (WATCH_MAX_COMPETITORS) always applies.
 * - Without a snapshot, the existing plan-based limit is preserved exactly.
 */
export function resolveWatchCompetitorLimit(
  snapshotLimit: number | null,
  plan: SocialOreoAccessPlan,
  hardMaxCompetitors: number = WATCH_MAX_COMPETITORS,
): number {
  const planLimit = competitorLimitForPlan(plan);
  if (snapshotLimit === null || snapshotLimit === undefined) return Math.min(planLimit, hardMaxCompetitors);
  return Math.max(0, Math.min(snapshotLimit, hardMaxCompetitors));
}
