import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_PLANS, formatPriceCents, lifetimePlan, monthlyPlan, planConfig } from "./plan-config";

const originalEnv = { ...process.env };

describe("plan-config single monthly price source", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("keeps Lifetime in USD and makes Monthly CAD authoritative", () => {
    expect(DEFAULT_PLANS.lifetime.currency).toBe("USD");
    expect(DEFAULT_PLANS.monthly.currency).toBe("CAD");
    expect(lifetimePlan().currency).toBe("USD");
    expect(monthlyPlan().currency).toBe("CAD");
  });

  it("formats prices using the explicitly supplied currency", () => {
    expect(formatPriceCents(4900, "CAD")).toBe("CA$49");
    expect(formatPriceCents(7900, "USD")).toBe("$79");
  });

  it("defaults the monthly UI price to the sandbox price when SQUARE_MONTHLY_PRICE_CENTS is unset", () => {
    delete process.env.SQUARE_MONTHLY_PRICE_CENTS;
    expect(planConfig().monthly.priceCents).toBe(1900);
    expect(monthlyPlan().priceCents).toBe(1900);
  });

  it("drives the monthly UI price from the authoritative SQUARE_MONTHLY_PRICE_CENTS env var", () => {
    process.env.SQUARE_MONTHLY_PRICE_CENTS = "2400";
    expect(planConfig().monthly.priceCents).toBe(2400);
    expect(monthlyPlan().priceCents).toBe(2400);
  });

  it("falls back to the sandbox price on an invalid monthly price", () => {
    process.env.SQUARE_MONTHLY_PRICE_CENTS = "not-a-number";
    expect(planConfig().monthly.priceCents).toBe(1900);
  });
});
