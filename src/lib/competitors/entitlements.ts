export type SocialOreoAccessPlan = "NONE" | "LIFETIME" | "MONTHLY";

const COMPETITOR_LIMITS: Record<SocialOreoAccessPlan, number> = {
  NONE: 0,
  LIFETIME: 1,
  MONTHLY: 3,
};

export function competitorLimitForPlan(plan: SocialOreoAccessPlan): number {
  return COMPETITOR_LIMITS[plan];
}

export function selectedCompetitorIdsForPlan(ids: string[], plan: SocialOreoAccessPlan): string[] {
  return [...new Set(ids.filter(Boolean))].slice(0, competitorLimitForPlan(plan));
}
