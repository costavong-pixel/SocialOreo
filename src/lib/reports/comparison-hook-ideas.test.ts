import { describe, expect, it } from "vitest";

import { comparisonHookIdeasResultSchema } from "./comparison-hook-ideas";

describe("comparison hook idea result", () => {
  it("normalizes a provider response that returns hook strings instead of objects", () => {
    const result = comparisonHookIdeasResultSchema.parse({
      plainEnglishSummary: "Use the competitor's practical problem-and-solution opening as inspiration.",
      examples: ["Small renovations can make a big visual difference when you start with this one change.", "Before you buy anything for your kitchen, check this first."],
    });

    expect(result.examples).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Example 1", whyItFits: expect.stringContaining("observed opening") })]));
    expect(result.examples[0]?.plan.first3Seconds).toContain("Say the hook");
  });
});
