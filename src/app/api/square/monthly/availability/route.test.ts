import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireCheckoutAccess, mockConfig } = vi.hoisted(() => ({ mockRequireCheckoutAccess: vi.fn(), mockConfig: vi.fn() }));
vi.mock("@/lib/payments/square/tester-gate", () => ({
  requireSquareCheckoutAccess: () => mockRequireCheckoutAccess(),
  requireSquareSandboxTester: () => mockRequireCheckoutAccess(),
}));
vi.mock("@/lib/payments/square/config", () => ({ getSquareConfig: () => mockConfig() }));
import { GET } from "./route";
import { clearRateLimits } from "@/lib/rate-limit/rate-limit";

describe("GET /api/square/monthly/availability", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearRateLimits();
  });
  it("does not reveal the hosted checkout to callers outside the access gate", async () => {
    mockRequireCheckoutAccess.mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
    expect(mockConfig).not.toHaveBeenCalled();
  });
  it("exposes only availability to an authorized caller", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth-owner", email: "owner@example.com" });
    mockConfig.mockReturnValue({});
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ available: true });
  });
  it("is available to any verified user in production mode", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth-prod", email: "buyer@example.com" });
    mockConfig.mockReturnValue({});
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ available: true });
  });
  it("returns 429 after the per-user rate limit is exhausted", async () => {
    mockRequireCheckoutAccess.mockResolvedValue({ id: "auth-owner", email: "owner@example.com" });
    mockConfig.mockReturnValue({});
    let lastStatus = 0;
    for (let i = 0; i < 12; i += 1) lastStatus = (await GET()).status;
    expect(lastStatus).toBe(429);
  });
});
