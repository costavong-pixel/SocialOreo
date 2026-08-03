import { describe, expect, it } from "vitest";

import { WATCH_CADENCE_HOURS, WATCH_MAX_COMPETITORS, normalizeWatchCadence, sanitizedWatchError, watchCaptureKey, watchProviderCostEstimate } from "./watch-policy";

describe("Watch release policy", () => {
  it("caps competitor watches at three and accepts only weekly or fortnightly cadence", () => {
    expect(WATCH_MAX_COMPETITORS).toBe(3);
    expect(normalizeWatchCadence(WATCH_CADENCE_HOURS.WEEKLY)).toBe(168);
    expect(normalizeWatchCadence(String(WATCH_CADENCE_HOURS.FORTNIGHTLY))).toBe(336);
    expect(normalizeWatchCadence(24)).toBeNull();
  });

  it("produces a stable capture key and visible provider estimate", () => {
    const captureAt = new Date("2026-07-31T12:00:00.000Z");
    expect(watchCaptureKey("monitor-1", captureAt, WATCH_CADENCE_HOURS.WEEKLY)).toBe(watchCaptureKey("monitor-1", captureAt, WATCH_CADENCE_HOURS.WEEKLY));
    expect(watchProviderCostEstimate("instagram", 30)).toBe(0.05);
    expect(watchProviderCostEstimate("youtube", 30)).toBe(0);
  });

  it("sanitizes provider failures into bounded operator-visible reasons", () => {
    expect(sanitizedWatchError(new Error("provider timeout with token=secret"))).toBe("Provider timeout.");
    expect(sanitizedWatchError(new Error("unexpected response with payload"))).toBe("Provider refresh failed.");
  });
});
