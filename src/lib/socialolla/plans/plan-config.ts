/**
 * Canonical M2 plan configuration (single pricing source for page + checkout).
 * Slice E: admin-configurable provisional $79 lifetime sandbox plan.
 */
export const DEFAULT_PLANS = {
  lifetime: {
    planId: "plan_lifetime_v1",
    name: "SocialOlla Lifetime",
    version: 1,
    priceCents: 7900, // $79.00 provisional
    currency: "USD",
    entitlements: {
      maxDestinations: 3,
      maxWatchCompetitors: 3,
      includedMonthlyCredits: 20,
      postCreditsPerRequest: 1,
      watchCreditsPerRequest: 1,
    },
  },
  monthly: {
    planId: "plan_monthly_v1",
    name: "SocialOlla Monthly",
    version: 1,
    priceCents: 1900, // $19.00 (sandbox monthly)
    currency: "USD",
    entitlements: {
      maxDestinations: 1,
      maxWatchCompetitors: 3,
      includedMonthlyCredits: 20,
      postCreditsPerRequest: 1,
      watchCreditsPerRequest: 1,
    },
  },
} as const;

export interface PlanDefinition {
  planId: string;
  name: string;
  version: number;
  priceCents: number;
  currency: string;
  entitlements: {
    maxDestinations: number;
    maxWatchCompetitors: number;
    includedMonthlyCredits: number;
    postCreditsPerRequest: number;
    watchCreditsPerRequest: number;
  };
}

/** Single pricing source: page and checkout both read this. */
export function planConfig(): Record<string, PlanDefinition> {
  const lifetimePrice = Number(process.env.SOCIALOLLA_LIFETIME_PRICE_CENTS ?? 7900);
  return {
    lifetime: { ...DEFAULT_PLANS.lifetime, priceCents: lifetimePrice },
    monthly: { ...DEFAULT_PLANS.monthly },
  };
}

export function lifetimePlan(): PlanDefinition {
  return planConfig().lifetime;
}

export function monthlyPlan(): PlanDefinition {
  return planConfig().monthly;
}

export function formatPriceCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(cents / 100);
}
