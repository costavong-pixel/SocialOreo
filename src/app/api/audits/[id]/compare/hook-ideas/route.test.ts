import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  checkRateLimit: vi.fn(),
  findMany: vi.fn(),
  suggestComparisonHookIdeas: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/rate-limit/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { auditJob: { findMany: mocks.findMany } } }));
vi.mock("@/lib/reports/comparison-hook-ideas", () => ({ suggestComparisonHookIdeas: mocks.suggestComparisonHookIdeas }));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "mine" }) };
const audits = [
  {
    id: "mine",
    campaignBriefJson: { occasion: "evergreen_content", goal: "followers", niche: "other", targetAudience: "Homeowners planning a renovation", offerOrCta: "Follow for practical renovation ideas", tone: "educational" },
    socialProfiles: [{ username: "myhome" }],
    socialVideos: [],
  },
  {
    id: "theirs",
    profileUrl: "https://instagram.com/designstudio/",
    campaignBriefJson: null,
    socialProfiles: [{ username: "designstudio" }],
    socialVideos: [{ caption: "How to make a small kitchen feel bigger.", viewCount: 2400 }],
  },
];

describe("comparison hook ideas API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "auth0-user" });
    mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 2, resetAt: Date.now() + 60_000 });
    mocks.findMany.mockResolvedValue(audits);
  });

  it("requires authentication before making an AI request", async () => {
    mocks.getSessionUser.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/audits/mine/compare/hook-ideas", { method: "POST", body: JSON.stringify({ competitorId: "theirs" }) }), context);

    expect(response.status).toBe(401);
    expect(mocks.suggestComparisonHookIdeas).not.toHaveBeenCalled();
  });

  it("returns two tailored examples from saved report data", async () => {
    mocks.suggestComparisonHookIdeas.mockResolvedValue({ plainEnglishSummary: "Use a practical before-and-after promise.", examples: [{ title: "Example one", hook: "Start here", whyItFits: "It is specific." }, { title: "Example two", hook: "Try this", whyItFits: "It invites a follow." }] });

    const response = await POST(new Request("http://localhost/api/audits/mine/compare/hook-ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competitorId: "theirs" }) }), context);

    expect(response.status).toBe(200);
    expect(mocks.suggestComparisonHookIdeas).toHaveBeenCalledWith(expect.objectContaining({ competitorLabel: "@designstudio", observedOpenings: ["How to make a small kitchen feel bigger."] }));
    await expect(response.json()).resolves.toMatchObject({ examples: [{ title: "Example one" }, { title: "Example two" }] });
  });
});
