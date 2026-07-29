import { describe, expect, it } from "vitest";

import { angleLibraryInputSchema, formatTagList, parseTagList } from "./types";

describe("angle library types", () => {
  it("parses comma-separated tags into unique trimmed values", () => {
    expect(parseTagList("instagram, tiktok ,instagram")).toEqual(["instagram", "tiktok"]);
    expect(formatTagList(["instagram", "tiktok"])).toBe("instagram, tiktok");
  });

  it("requires trusted admin-authored fields and rejects empty hook formulas", () => {
    const result = angleLibraryInputSchema.safeParse({
      angleName: "Local urgency drop",
      category: "promo",
      platformFit: ["instagram"],
      nicheFit: ["food"],
      occasionFit: ["holiday_promo"],
      goalFit: ["sales"],
      tone: ["direct"],
      hookFormula: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a complete trusted angle payload", () => {
    const result = angleLibraryInputSchema.safeParse({
      angleName: "Local urgency drop",
      category: "promo",
      platformFit: ["instagram"],
      nicheFit: ["food"],
      occasionFit: ["holiday_promo"],
      goalFit: ["sales"],
      tone: ["direct"],
      hookFormula: "[City], this is only happening today...",
      ctaFormula: "Show this before close.",
      internalOnly: true,
    });

    expect(result.success).toBe(true);
  });
});
