import { describe, expect, it } from "vitest";
import {
  approveProfile,
  assertNoInventedClaims,
  createFirstPost,
  createSevenDayPlan,
  identifyGaps,
  parsePurpose,
  proposeAccountMetadata,
  selectProviderDisabledDestination,
} from "./onboarding";

describe("Slice E — conversational onboarding (provider-disabled)", () => {
  it("extracts a proposed structured profile from ordinary language", () => {
    const draft = parsePurpose("I run a local coffee shop in Toronto, playful vibe, want to post on instagram about coffee and baking.");
    expect(draft.businessName).toContain("coffee shop");
    expect(draft.niche).toBe("coffee");
    expect(draft.tone).toBe("playful");
    expect(draft.primaryPlatform).toBe("instagram");
    expect(draft.contentTopics).toContain("baking");
  });

  it("identifies meaningful gaps when fields are missing", () => {
    const draft = parsePurpose("just started, not sure yet");
    const gaps = identifyGaps(draft);
    const fields = gaps.map((g) => g.field);
    expect(fields).toContain("businessName");
    expect(fields).toContain("niche");
    expect(fields).toContain("primaryPlatform");
    expect(fields).toContain("contentTopics");
  });

  it("keeps only approved profile fields", () => {
    const draft = parsePurpose("I have a small bakery, minimal tone, posting on tiktok about baking.");
    const approved = approveProfile(draft, ["businessName", "tone", "primaryPlatform"]);
    expect(approved.businessName).toBeDefined();
    expect(approved.tone).toBe("minimal");
    expect(approved.niche).toBeUndefined();
    expect(approved.targetAudience).toBeUndefined();
  });

  it("selects a provider-disabled sandbox destination", () => {
    const destination = selectProviderDisabledDestination("instagram", "@costa.studio");
    expect(destination.providerDisabled).toBe(true);
    expect(destination.accountLabel).toBe("@costa.studio");
  });

  it("proposes connected-account metadata differences for approval", () => {
    const proposal = proposeAccountMetadata("instagram", {
      accountType: "PROFESSIONAL",
      businessCategory: null,
    });
    const fields = proposal.differences.map((d) => d.field);
    expect(fields).toEqual(["accountType"]);
  });

  it("creates one destination-specific first post that requires publish confirmation", () => {
    const post = createFirstPost({
      destinationRef: "dst_abcdefghijklmnop",
      language: "en",
      businessName: "Costa Bakery",
      topic: "baking",
    });
    expect(post.status).toBe("review");
    expect(post.requiresPublishConfirmation).toBe(true);
    expect(post.caption).toContain("Costa Bakery");
  });

  it("creates a seven-day plan with ideas staying light drafts by default", () => {
    const plan = createSevenDayPlan({
      destinationRef: "dst_abcdefghijklmnop",
      language: "en",
      contentTopics: ["coffee", "baking"],
    });
    expect(plan).toHaveLength(7);
    expect(plan[0].status).toBe("light_draft");
    for (const item of plan.slice(1)) {
      expect(item.status).toBe("idea");
    }
  });

  it("does not invent prices, hours, addresses, policies, or credentials", () => {
    const draft = parsePurpose("I have a flower shop, want instagram content about arranging flowers.");
    expect(draft.promotionalClaims).toEqual([]);
    expect(draft.raw).not.toMatch(/\$\d|\d{1,2}:\d{2}/);
    expect(draft.raw).not.toMatch(/\b(no delivery charges|open 7 days|voted best)\b/i);
    expect(assertNoInventedClaims(draft)).toBe(true);
  });
});
