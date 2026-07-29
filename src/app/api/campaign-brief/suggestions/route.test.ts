import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  checkRateLimit: vi.fn(),
  suggestCampaignBrief: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/rate-limit/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/lib/campaign-brief/suggestions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/campaign-brief/suggestions")>();
  return { ...original, suggestCampaignBrief: mocks.suggestCampaignBrief };
});

import { POST } from "./route";

const payload = {
  occasion: "New menu launch",
  goal: "Get bookings",
  niche: "Italian restaurant",
  tone: "Warm",
};

describe("campaign brief suggestions API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue({ id: "auth0-user" });
    mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 5, resetAt: Date.now() + 60_000 });
  });

  it("requires authentication before requesting a suggestion", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/campaign-brief/suggestions", {
      method: "POST",
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(401);
    expect(mocks.suggestCampaignBrief).not.toHaveBeenCalled();
  });

  it("rejects an incomplete brief before calling the AI provider", async () => {
    const response = await POST(new Request("http://localhost/api/campaign-brief/suggestions", {
      method: "POST",
      body: JSON.stringify({ ...payload, niche: "" }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.suggestCampaignBrief).not.toHaveBeenCalled();
  });

  it("returns editable target-audience and CTA suggestions", async () => {
    mocks.suggestCampaignBrief.mockResolvedValue({
      targetAudience: "Downtown diners looking for a relaxed date-night meal",
      offerOrCta: "Book a table this weekend",
    });

    const response = await POST(new Request("http://localhost/api/campaign-brief/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(200);
    expect(mocks.suggestCampaignBrief).toHaveBeenCalledWith(payload);
    await expect(response.json()).resolves.toEqual({
      targetAudience: "Downtown diners looking for a relaxed date-night meal",
      offerOrCta: "Book a table this weekend",
    });
  });
});
