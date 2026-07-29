import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetSessionUser = vi.fn();
const mockCreateAndRunAudit = vi.fn();

vi.mock("@/lib/auth/current-user", () => ({
  getSessionUser: () => mockGetSessionUser(),
}));

vi.mock("@/lib/audit/run-audit", () => ({
  createAndRunAudit: (...args: unknown[]) => mockCreateAndRunAudit(...args),
}));

describe("POST /api/audits email verification", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unverified Auth0 email addresses", async () => {
    mockGetSessionUser.mockResolvedValue({
      id: "auth0-1",
      email: "creator@example.com",
      emailVerified: false,
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.instagram.com/example/",
          campaignBrief: {
            occasion: "product_launch",
            goal: "sales",
            niche: "food",
            targetAudience: "Local diners",
            offerOrCta: "Book tonight",
            tone: "direct",
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mockCreateAndRunAudit).not.toHaveBeenCalled();
  });
});
