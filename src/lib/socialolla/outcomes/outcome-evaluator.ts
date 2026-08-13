export const OUTCOME_LOOP_MIN_SNAPSHOT_COUNT = 2;
export const OUTCOME_LOOP_MIN_SNAPSHOT_SPAN_HOURS = 24;
export const OUTCOME_LOOP_MIN_PUBLISHED_AGE_HOURS = 48;
export const OUTCOME_LOOP_MIN_BASELINE_SAMPLE = 3;

export type OutcomeMetricPoint = {
  capturedAt: Date;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

export type OutcomeDecision = "KEEP" | "CHANGE" | "PAUSE";

export type OutcomeEvidence = {
  scope: "manual-platform-metrics";
  caveat: "Comparative signal only; this does not prove that the content caused the result.";
  current: {
    snapshotCount: number;
    observationSpanHours: number;
    publishedAgeHours: number;
    views: number | null;
    visibleInteractionRate: number | null;
  };
  baseline: {
    sampleSize: number;
    medianViews: number | null;
    medianVisibleInteractionRate: number | null;
  };
  limitations: string[];
};

export type NextPlanRecommendation = {
  focus: string;
  preserve: string[];
  test: string;
  approvalBoundary: "Owner approval is required before any separate draft or schedule action.";
};

export type OutcomeEvaluationResult = {
  status: "INSUFFICIENT_EVIDENCE" | "READY";
  decision: OutcomeDecision | null;
  confidence: number;
  summary: string;
  evidence: OutcomeEvidence;
  nextPlan: NextPlanRecommendation | null;
};

function nonNegativeFinite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function visibleInteractionRate(point: Pick<OutcomeMetricPoint, "views" | "likes" | "comments" | "shares" | "saves">): number | null {
  const views = nonNegativeFinite(point.views);
  if (views === null || views <= 0) return null;
  const interactions = [point.likes, point.comments, point.shares, point.saves]
    .map(nonNegativeFinite)
    .filter((value): value is number => value !== null);
  if (interactions.length === 0) return null;
  return interactions.reduce((total, value) => total + value, 0) / views;
}

function hoursBetween(earlier: Date, later: Date): number {
  return Math.max(0, (later.getTime() - earlier.getTime()) / (60 * 60 * 1000));
}

function roundedRate(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}

function baseEvidence(input: {
  publishedAt: Date;
  now: Date;
  snapshots: OutcomeMetricPoint[];
  baselines: OutcomeMetricPoint[];
}): OutcomeEvidence {
  const orderedSnapshots = [...input.snapshots].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const latest = orderedSnapshots.at(-1);
  const baselinePairs = input.baselines
    .map((point) => ({ views: nonNegativeFinite(point.views), interactionRate: visibleInteractionRate(point) }))
    .filter((point): point is { views: number; interactionRate: number } => point.views !== null && point.interactionRate !== null);

  return {
    scope: "manual-platform-metrics",
    caveat: "Comparative signal only; this does not prove that the content caused the result.",
    current: {
      snapshotCount: orderedSnapshots.length,
      observationSpanHours:
        orderedSnapshots.length >= 2 ? Math.round(hoursBetween(orderedSnapshots[0].capturedAt, orderedSnapshots.at(-1)!.capturedAt) * 10) / 10 : 0,
      publishedAgeHours: Math.round(hoursBetween(input.publishedAt, input.now) * 10) / 10,
      views: latest ? nonNegativeFinite(latest.views) : null,
      visibleInteractionRate: latest ? roundedRate(visibleInteractionRate(latest)) : null,
    },
    baseline: {
      sampleSize: baselinePairs.length,
      medianViews: median(baselinePairs.map((point) => point.views)),
      medianVisibleInteractionRate: roundedRate(median(baselinePairs.map((point) => point.interactionRate))),
    },
    limitations: [],
  };
}

function insufficient(evidence: OutcomeEvidence, limitations: string[]): OutcomeEvaluationResult {
  const uniqueLimitations = [...new Set(limitations)];
  evidence.limitations = uniqueLimitations;
  return {
    status: "INSUFFICIENT_EVIDENCE",
    decision: null,
    confidence: 0,
    summary: `No next-plan recommendation yet: ${uniqueLimitations.join(" ")}`,
    evidence,
    nextPlan: null,
  };
}

function nextPlan(decision: OutcomeDecision): NextPlanRecommendation {
  if (decision === "KEEP") {
    return {
      focus: "Keep this content direction, but do not duplicate the exact post.",
      preserve: ["The underlying topic or angle", "The audience problem or payoff that the approved version addressed"],
      test: "Change one independent variable in the next draft, starting with the opening hook or first visual beat.",
      approvalBoundary: "Owner approval is required before any separate draft or schedule action.",
    };
  }
  if (decision === "PAUSE") {
    return {
      focus: "Pause this exact content recipe until a revised hypothesis is approved.",
      preserve: ["Only the broader audience problem if it remains relevant"],
      test: "Create a fresh hypothesis with a different opening, structure, and call to action; do not infer causation from this comparison alone.",
      approvalBoundary: "Owner approval is required before any separate draft or schedule action.",
    };
  }
  return {
    focus: "Keep one useful element, then change the opening or call to action.",
    preserve: ["One proven topic or payoff from the approved version"],
    test: "Run one clearly documented variation rather than changing the topic, hook, structure, and CTA all at once.",
    approvalBoundary: "Owner approval is required before any separate draft or schedule action.",
  };
}

/**
 * Produces a transparent, comparative recommendation from manually recorded
 * post-level metrics. It intentionally fails closed to INSUFFICIENT_EVIDENCE
 * when the observation window, current metrics, or comparable history is weak.
 */
export function evaluateContentOutcome(input: {
  publishedAt: Date;
  snapshots: OutcomeMetricPoint[];
  comparableFinalSnapshots: OutcomeMetricPoint[];
  now?: Date;
}): OutcomeEvaluationResult {
  const now = input.now ?? new Date();
  const evidence = baseEvidence({
    publishedAt: input.publishedAt,
    now,
    snapshots: input.snapshots,
    baselines: input.comparableFinalSnapshots,
  });
  const limitations: string[] = [];

  if (evidence.current.publishedAgeHours < OUTCOME_LOOP_MIN_PUBLISHED_AGE_HOURS) {
    limitations.push(`Wait until the post has been published for at least ${OUTCOME_LOOP_MIN_PUBLISHED_AGE_HOURS} hours.`);
  }
  if (evidence.current.snapshotCount < OUTCOME_LOOP_MIN_SNAPSHOT_COUNT) {
    limitations.push(`Record at least ${OUTCOME_LOOP_MIN_SNAPSHOT_COUNT} manual metric snapshots.`);
  }
  if (evidence.current.observationSpanHours < OUTCOME_LOOP_MIN_SNAPSHOT_SPAN_HOURS) {
    limitations.push(`Spread manual snapshots across at least ${OUTCOME_LOOP_MIN_SNAPSHOT_SPAN_HOURS} hours.`);
  }
  if (evidence.current.views === null || evidence.current.views <= 0) {
    limitations.push("The latest snapshot needs a positive view count.");
  }
  if (evidence.current.visibleInteractionRate === null) {
    limitations.push("The latest snapshot needs at least one visible interaction metric (likes, comments, shares, or saves).");
  }
  if (evidence.baseline.sampleSize < OUTCOME_LOOP_MIN_BASELINE_SAMPLE) {
    limitations.push(`Record complete final metrics for at least ${OUTCOME_LOOP_MIN_BASELINE_SAMPLE} comparable published posts on this destination and platform.`);
  }
  if (evidence.baseline.medianViews === null || evidence.baseline.medianViews <= 0 || evidence.baseline.medianVisibleInteractionRate === null || evidence.baseline.medianVisibleInteractionRate <= 0) {
    limitations.push("Comparable history needs positive view and visible-interaction rates.");
  }
  if (limitations.length > 0) return insufficient(evidence, limitations);

  const viewRatio = evidence.current.views! / evidence.baseline.medianViews!;
  const interactionRatio = evidence.current.visibleInteractionRate! / evidence.baseline.medianVisibleInteractionRate!;
  let decision: OutcomeDecision = "CHANGE";
  if (viewRatio >= 1.15 && interactionRatio >= 1.1) {
    decision = "KEEP";
  } else if (evidence.baseline.sampleSize >= 5 && viewRatio <= 0.6 && interactionRatio <= 0.7) {
    decision = "PAUSE";
  }

  const confidence = Math.min(
    90,
    55 +
      Math.min(20, (evidence.baseline.sampleSize - OUTCOME_LOOP_MIN_BASELINE_SAMPLE) * 5) +
      Math.min(10, Math.floor(evidence.current.publishedAgeHours / 48) * 2) +
      Math.min(5, (evidence.current.snapshotCount - OUTCOME_LOOP_MIN_SNAPSHOT_COUNT) * 2),
  );
  const viewPercent = Math.round(viewRatio * 100);
  const interactionPercent = Math.round(interactionRatio * 100);
  evidence.limitations = ["Manual platform metrics can be incomplete or revised by the platform."];

  return {
    status: "READY",
    decision,
    confidence,
    summary: `Observed views are ${viewPercent}% and visible interaction rate is ${interactionPercent}% of the comparable-post median. This is comparative evidence, not proof of causation.`,
    evidence,
    nextPlan: nextPlan(decision),
  };
}
