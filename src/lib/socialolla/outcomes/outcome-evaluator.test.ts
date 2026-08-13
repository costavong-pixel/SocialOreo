import { describe, expect, it } from "vitest";
import { evaluateContentOutcome, visibleInteractionRate } from "./outcome-evaluator";

const NOW = new Date("2026-08-13T12:00:00.000Z");
const PUBLISHED_AT = new Date("2026-08-09T12:00:00.000Z");

function point(hoursBeforeNow: number, views: number, interactions = 100) {
  return {
    capturedAt: new Date(NOW.getTime() - hoursBeforeNow * 60 * 60 * 1000),
    views,
    likes: interactions,
    comments: 0,
    shares: 0,
    saves: 0,
  };
}

describe("evaluateContentOutcome", () => {
  it("fails closed until the observation window and comparable evidence are complete", () => {
    const result = evaluateContentOutcome({
      publishedAt: new Date("2026-08-12T12:00:00.000Z"),
      snapshots: [point(1, 500)],
      comparableFinalSnapshots: [point(10, 500)],
      now: NOW,
    });

    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.decision).toBeNull();
    expect(result.nextPlan).toBeNull();
    expect(result.evidence.limitations.join(" ")).toMatch(/48 hours/);
    expect(result.evidence.limitations.join(" ")).toMatch(/at least 3 comparable/);
  });

  it("returns KEEP only when both views and visible interaction rate beat the comparable median", () => {
    const result = evaluateContentOutcome({
      publishedAt: PUBLISHED_AT,
      snapshots: [point(48, 1_100, 110), point(1, 1_500, 180)],
      comparableFinalSnapshots: [point(2, 800, 80), point(3, 1_000, 100), point(4, 1_200, 120)],
      now: NOW,
    });

    expect(result.status).toBe("READY");
    expect(result.decision).toBe("KEEP");
    expect(result.confidence).toBeGreaterThanOrEqual(55);
    expect(result.evidence.scope).toBe("manual-platform-metrics");
    expect(result.summary).toContain("not proof of causation");
    expect(result.nextPlan?.approvalBoundary).toBe("Owner approval is required before any separate draft or schedule action.");
  });

  it("uses PAUSE only for a well-sampled, materially weak comparison", () => {
    const result = evaluateContentOutcome({
      publishedAt: PUBLISHED_AT,
      snapshots: [point(48, 600, 30), point(1, 500, 20)],
      comparableFinalSnapshots: [point(2, 1_000, 100), point(3, 1_100, 110), point(4, 1_200, 120), point(5, 900, 90), point(6, 1_050, 105)],
      now: NOW,
    });

    expect(result.status).toBe("READY");
    expect(result.decision).toBe("PAUSE");
    expect(result.nextPlan?.focus).toMatch(/Pause this exact content recipe/);
  });

  it("does not invent an interaction rate when no visible interaction metric was captured", () => {
    expect(visibleInteractionRate({ views: 100, likes: null, comments: null, shares: null, saves: null })).toBeNull();
    expect(visibleInteractionRate({ views: 100, likes: 5, comments: null, shares: null, saves: null })).toBe(0.05);
  });
});
