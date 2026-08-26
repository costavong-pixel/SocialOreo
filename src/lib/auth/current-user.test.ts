import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  bootstrap: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ auth0: { getSession: () => mocks.getSession() } }));
vi.mock("@/lib/auth/staging-acceptance", () => ({ bootstrapStagingAcceptance: (...args: unknown[]) => mocks.bootstrap(...args) }));

import { getAcceptedSessionUser, getVerifiedSessionUser } from "./current-user";

describe("application session acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    mocks.getSession.mockResolvedValue({ user: { sub: "auth0|owner", email: "info@slabburgers.com", email_verified: false } });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("keeps the strict provider-verification helper closed for an unverified provider claim", async () => {
    await expect(getVerifiedSessionUser()).resolves.toBeNull();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("accepts only an explicit staging bootstrap while preserving the false provider claim", async () => {
    mocks.bootstrap.mockResolvedValue({
      status: "accepted",
      acceptance: "staging-bootstrap",
      userId: "db-user",
      authUserId: "auth0|owner",
      email: "info@slabburgers.com",
      workspaceId: "db-workspace",
      auditExternalId: "evt-staging",
    });

    const user = await getAcceptedSessionUser();

    expect(user).toMatchObject({ id: "auth0|owner", email: "info@slabburgers.com", emailVerified: false, acceptance: "staging-bootstrap" });
    expect(mocks.bootstrap).toHaveBeenCalledWith(expect.objectContaining({ id: "auth0|owner", emailVerified: false }));
  });

  it("does not invoke staging bootstrap for a provider-verified account", async () => {
    mocks.getSession.mockResolvedValue({ user: { sub: "auth0|verified", email: "verified@example.com", email_verified: true } });

    await expect(getAcceptedSessionUser()).resolves.toMatchObject({
      id: "auth0|verified",
      emailVerified: true,
      acceptance: "provider-verified",
    });
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
});
