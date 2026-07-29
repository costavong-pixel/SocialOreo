import { describe, expect, it } from "vitest";

import { competitorLimitForPlan, selectedCompetitorIdsForPlan } from "./entitlements";

describe("competitor plan entitlements", () => {
  it("allows no competitors without a paid plan", () => {
    expect(competitorLimitForPlan("NONE")).toBe(0);
    expect(selectedCompetitorIdsForPlan(["one"], "NONE")).toEqual([]);
  });

  it("allows one competitor for lifetime access", () => {
    expect(competitorLimitForPlan("LIFETIME")).toBe(1);
    expect(selectedCompetitorIdsForPlan(["one", "two"], "LIFETIME")).toEqual(["one"]);
  });

  it("allows three unique competitors for monthly access", () => {
    expect(competitorLimitForPlan("MONTHLY")).toBe(3);
    expect(selectedCompetitorIdsForPlan(["one", "one", "two", "three", "four"], "MONTHLY")).toEqual(["one", "two", "three"]);
  });
});
