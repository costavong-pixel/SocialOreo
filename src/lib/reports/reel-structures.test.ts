import { describe, expect, it } from "vitest";

import { buildReelStructures } from "./reel-structures";

describe("buildReelStructures", () => {
  it("uses tailored angle recommendations when they are available", () => {
    const structures = buildReelStructures({
      angleRecommendations: [
        { angleName: "Tailored angle", reason: "Fits the campaign", hook: "Try this first" },
      ],
      readyToPostHooks: ["Fallback hook"],
    });

    expect(structures).toEqual([
      { angleName: "Tailored angle", reason: "Fits the campaign", hook: "Try this first" },
    ]);
  });

  it("turns up to five ready-to-post hooks into practical structures", () => {
    const structures = buildReelStructures({
      readyToPostHooks: ["One", "Two", "Three", "Four", "Five", "Six"],
    });

    expect(structures).toHaveLength(5);
    expect(structures[0]).toMatchObject({ angleName: "Problem to payoff", hook: "One" });
    expect(structures[4]).toMatchObject({ angleName: "Story to action", hook: "Five" });
  });
});
