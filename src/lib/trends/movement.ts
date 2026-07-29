export type TrendCaptureForMovement = {
  completedAt: Date | null;
  videos: Array<{ sourceUrl: string }>;
};

export type TrendMovementReadiness = {
  captureCount: number;
  sourceReelCount: number;
  repeatedSourceCount: number;
  firstCapturedAt: Date | null;
  latestCapturedAt: Date | null;
  status: "NEEDS_SECOND_CAPTURE" | "NO_REPEATED_SOURCES" | "READY_TO_COMPARE";
};

export function buildTrendMovementReadiness(captures: TrendCaptureForMovement[]): TrendMovementReadiness {
  const completedCaptures = captures
    .filter((capture): capture is TrendCaptureForMovement & { completedAt: Date } => Boolean(capture.completedAt))
    .sort((left, right) => left.completedAt.getTime() - right.completedAt.getTime());
  const sourceOccurrences = new Map<string, number>();

  for (const capture of completedCaptures) {
    for (const video of capture.videos) {
      sourceOccurrences.set(video.sourceUrl, (sourceOccurrences.get(video.sourceUrl) ?? 0) + 1);
    }
  }

  const repeatedSourceCount = [...sourceOccurrences.values()].filter((count) => count >= 2).length;
  const status = completedCaptures.length < 2
    ? "NEEDS_SECOND_CAPTURE"
    : repeatedSourceCount === 0
      ? "NO_REPEATED_SOURCES"
      : "READY_TO_COMPARE";

  return {
    captureCount: completedCaptures.length,
    sourceReelCount: sourceOccurrences.size,
    repeatedSourceCount,
    firstCapturedAt: completedCaptures[0]?.completedAt ?? null,
    latestCapturedAt: completedCaptures.at(-1)?.completedAt ?? null,
    status,
  };
}
