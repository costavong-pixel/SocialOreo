import type { TrendMovementReadiness } from "./movement";

export type TrendOpportunitySource = {
  platform: "INSTAGRAM" | "TIKTOK" | "YOUTUBE";
  sourceType: "KEYWORD" | "HASHTAG" | "CREATOR";
  query: string;
  readiness: TrendMovementReadiness;
};

export type CrossPlatformOpportunity = {
  key: string;
  sourceType: TrendOpportunitySource["sourceType"];
  query: string;
  platforms: TrendOpportunitySource["platform"][];
  readyPlatforms: TrendOpportunitySource["platform"][];
  status: "NEEDS_CROSS_PLATFORM_EVIDENCE" | "NEEDS_MOVEMENT_EVIDENCE" | "READY_TO_ADAPT";
};

function normalizedQuery(query: string) {
  return query.trim().replace(/^[@#]+/, "").toLocaleLowerCase();
}

export function buildCrossPlatformOpportunities(sources: TrendOpportunitySource[]): CrossPlatformOpportunity[] {
  const groups = new Map<string, TrendOpportunitySource[]>();

  for (const source of sources) {
    const key = `${source.sourceType}:${normalizedQuery(source.query)}`;
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }

  return [...groups.entries()].map(([key, groupedSources]) => {
    const platforms = [...new Set(groupedSources.map((source) => source.platform))];
    const readyPlatforms = [...new Set(groupedSources
      .filter((source) => source.readiness.status === "READY_TO_COMPARE")
      .map((source) => source.platform))];
    const status: CrossPlatformOpportunity["status"] = platforms.length < 2
      ? "NEEDS_CROSS_PLATFORM_EVIDENCE"
      : readyPlatforms.length < platforms.length
        ? "NEEDS_MOVEMENT_EVIDENCE"
        : "READY_TO_ADAPT";

    return {
      key,
      sourceType: groupedSources[0].sourceType,
      query: groupedSources[0].query,
      platforms,
      readyPlatforms,
      status,
    };
  }).sort((left, right) => right.platforms.length - left.platforms.length || left.key.localeCompare(right.key));
}
