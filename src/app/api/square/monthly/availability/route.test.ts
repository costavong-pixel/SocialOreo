import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireTester, mockConfig } = vi.hoisted(() => ({ mockRequireTester: vi.fn(), mockConfig: vi.fn() }));
vi.mock("@/lib/payments/square/tester-gate", () => ({ requireSquareSandboxTester: () => mockRequireTester() }));
vi.mock("@/lib/payments/square/config", () => ({ getSquareConfig: () => mockConfig() }));
import { GET } from "./route";

describe("GET /api/square/monthly/availability", () => {
  afterEach(() => vi.clearAllMocks());
  it("does not reveal the hosted checkout to callers outside the tester gate", async () => {
    mockRequireTester.mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
    expect(mockConfig).not.toHaveBeenCalled();
  });
  it("exposes only availability to the allowlisted tester", async () => {
    mockRequireTester.mockResolvedValue({ id: "auth-owner", email: "owner@example.com" });
    mockConfig.mockReturnValue({});
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ available: true });
  });
});
