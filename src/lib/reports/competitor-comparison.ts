import type { PerformancePattern, PublicMetrics } from "./public-metrics";

export type CompetitorReport = {
  id: string;
  label: string;
  score: number;
  campaignGoal?: string;
  targetAudience?: string;
  offerOrCta?: string;
  publicMetrics: PublicMetrics;
};

export type ComparisonMetric = {
  label: string;
  yours: string;
  competitor: string;
};

export type CompetitorComparison = {
  metrics: ComparisonMetric[];
  studyIdeas: string[];
  scoreIsComparable: boolean;
  contentGaps: ContentGap[];
  hookExtractions: CompetitorHookExtraction[];
};

export type ContentGap = {
  category: string;
  title: string;
  evidence: string;
  test: string;
};

export type CompetitorHookExtraction = {
  sourceHook: string;
  pattern: string;
  evidence: string;
  testHook: string;
  sourceUrl: string;
};

function formatNumber(value: number | undefined): string {
  return value === undefined ? "Not available" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "Not available" : new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function competitorPatternToTest(
  category: string,
  yours: PerformancePattern[],
  competitor: PerformancePattern[],
  competitorLabel: string,
  test: (label: string) => string,
): ContentGap | undefined {
  const pattern = competitor.find((candidate) => !yours.some((own) => own.label === candidate.label)) ?? competitor[0];
  if (!pattern) return undefined;

  const ownPattern = yours[0];
  const contrast = ownPattern && ownPattern.label !== pattern.label ? ` Your strongest observed pattern is ${ownPattern.label.toLowerCase()}.` : "";
  return {
    category,
    title: `Test ${pattern.label.toLowerCase()}`,
    evidence: `${competitorLabel}'s saved sample averages ${formatNumber(pattern.averageViews)} public views across ${pattern.sampleSize} reel${pattern.sampleSize === 1 ? "" : "s"} with this pattern.${contrast}`,
    test: test(pattern.label),
  };
}

function shorten(value: string | undefined, fallback: string, limit = 88): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > limit ? `${normalized.slice(0, limit - 3).trimEnd()}...` : normalized;
}

function openingLine(caption: string): string | undefined {
  const opening = caption.replace(/\s+/g, " ").split(/(?<=[.!?])\s|\n/)[0]?.trim();
  if (!opening || opening === "No public caption") return undefined;
  return shorten(opening, "", 120);
}

function hookToTest(pattern: string | undefined): string {
  switch (pattern) {
    case "How-to hooks":
      return "Start with one clear outcome, then show the first useful step.";
    case "Question hooks":
      return "Start with one specific question your audience already asks.";
    case "List hooks":
      return "Lead with a short numbered promise, then deliver each point quickly.";
    default:
      return "Make one clear claim, then show proof or an example right away.";
  }
}

function buildHookExtractions(yours: CompetitorReport, competitor: CompetitorReport): CompetitorHookExtraction[] {
  const pattern = competitor.publicMetrics.hookPatterns[0]?.label;
  return competitor.publicMetrics.topReels
    .flatMap((reel) => {
      const sourceHook = openingLine(reel.caption);
      if (!sourceHook) return [];

      return [{
        sourceHook,
        pattern: pattern ?? "Observed opening",
        evidence: `${competitor.label} saved reel with ${formatNumber(reel.views)} public views.`,
        testHook: hookToTest(pattern),
        sourceUrl: reel.url,
      }];
    })
    .slice(0, 3);
}

export function buildCompetitorComparison(yours: CompetitorReport, competitor: CompetitorReport): CompetitorComparison {
  const own = yours.publicMetrics.summary;
  const rival = competitor.publicMetrics.summary;
  const competitorHook = competitor.publicMetrics.hookPatterns[0]?.label;
  const competitorWindow = competitor.publicMetrics.postingWindows[0]?.label;
  const scoreIsComparable = Boolean(yours.campaignGoal && competitor.campaignGoal && yours.campaignGoal === competitor.campaignGoal);
  const ideas: string[] = [];
  const contentGaps = [
    competitorPatternToTest("Hook format", yours.publicMetrics.hookPatterns, competitor.publicMetrics.hookPatterns, competitor.label, (label) => `Open one original reel with a ${label.toLowerCase().replace(/ hooks$/, "")} for your own audience and offer.`),
    competitorPatternToTest("Reel length", yours.publicMetrics.durationPatterns, competitor.publicMetrics.durationPatterns, competitor.label, (label) => `Make one version in the ${label.toLowerCase()} range, then compare it with your normal format.`),
    competitorPatternToTest("Caption style", yours.publicMetrics.captionPatterns, competitor.publicMetrics.captionPatterns, competitor.label, (label) => `Write a distinct ${label.toLowerCase()} caption that supports the same reel goal.`),
  ].filter((gap): gap is ContentGap => Boolean(gap));
  const hookExtractions = buildHookExtractions(yours, competitor);

  if (!scoreIsComparable) {
    ideas.push("The two reports have different goals, so do not treat the scores as a winner and loser. Use the patterns below as ideas for your own next post.");
  } else if (competitor.score > yours.score) {
    ideas.push(`${competitor.label} has a higher campaign score for this goal. Pick one clear pattern from their report and test it in one of your next reels.`);
  } else if (yours.score > competitor.score) {
    ideas.push(`Your campaign score is higher for this goal. Use their strongest public reel format as a new idea, without copying their message or positioning.`);
  } else {
    ideas.push("The campaign scores are similar. Choose the one public-reel pattern that feels most useful for your audience and test it once.");
  }

  if (competitorHook) {
    ideas.push(`${competitor.label}'s strongest observed pattern is ${competitorHook.toLowerCase()}. Use the hook-ideas section to turn that pattern into your own original opening.`);
  }

  if (competitorWindow) {
    ideas.push(`${competitor.label}'s strongest observed posting time is ${competitorWindow}. Try that time once, then compare it with your normal post time.`);
  }

  return {
    scoreIsComparable,
    contentGaps,
    hookExtractions,
    metrics: [
      { label: "Campaign score", yours: `${yours.score}/100`, competitor: `${competitor.score}/100` },
      { label: "Median public views", yours: formatNumber(own.medianViews), competitor: formatNumber(rival.medianViews) },
      { label: "Engagement per view", yours: formatPercent(own.engagementPerView), competitor: formatPercent(rival.engagementPerView) },
      { label: "Public reels with views", yours: String(own.reelsWithViews), competitor: String(rival.reelsWithViews) },
    ],
    studyIdeas: ideas,
  };
}
