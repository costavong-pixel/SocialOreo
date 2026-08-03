import type { SocialPlatform } from "@/lib/providers/social/types";
import { estimateSocialAuditCost } from "@/lib/providers/social/audit-provider-config";

export const WATCH_MAX_COMPETITORS = 3;
export const WATCH_CADENCE_HOURS = {
  WEEKLY: 7 * 24,
  FORTNIGHTLY: 14 * 24,
} as const;

export type WatchCadenceHours = (typeof WATCH_CADENCE_HOURS)[keyof typeof WATCH_CADENCE_HOURS];

export function normalizeWatchCadence(value: unknown): WatchCadenceHours | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return numeric === WATCH_CADENCE_HOURS.WEEKLY || numeric === WATCH_CADENCE_HOURS.FORTNIGHTLY ? numeric : null;
}

export function watchCadenceLabel(cadenceHours: number): string {
  return cadenceHours === WATCH_CADENCE_HOURS.FORTNIGHTLY ? "Fortnightly" : "Weekly";
}

export function watchProviderCostEstimate(platform: string, reelLimit: number): number {
  if (platform !== "instagram" && platform !== "tiktok" && platform !== "youtube") return 0;
  return estimateSocialAuditCost(platform as SocialPlatform, reelLimit);
}

export function watchCaptureKey(monitorId: string, captureAt: Date, cadenceHours: number): string {
  const cadenceWindow = Math.floor(captureAt.getTime() / (cadenceHours * 60 * 60 * 1000));
  return `${monitorId}:${cadenceHours}:${cadenceWindow}`;
}

export function sanitizedWatchError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("timed out")) return "Provider timeout.";
  if (message.includes("rate limit") || message.includes("quota")) return "Provider rate limit reached.";
  if (message.includes("configuration") || message.includes("missing")) return "Provider configuration unavailable.";
  return "Provider refresh failed.";
}
