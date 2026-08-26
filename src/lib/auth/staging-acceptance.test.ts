import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUniqueUser: vi.fn(),
  findFirstUser: vi.fn(),
  createUser: vi.fn(),
  findUniqueAudit: vi.fn(),
  createAudit: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => Promise<unknown>) => mocks.transaction(callback),
    user: {
      findUnique: (...args: unknown[]) => mocks.findUniqueUser(...args),
      findFirst: (...args: unknown[]) => mocks.findFirstUser(...args),
      create: (...args: unknown[]) => mocks.createUser(...args),
    },
    auditEvent: {
      findUnique: (...args: unknown[]) => mocks.findUniqueAudit(...args),
      create: (...args: unknown[]) => mocks.createAudit(...args),
    },
  },
}));

vi.mock("@/lib/socialolla/workspace", () => ({
  getOrCreatePersonalWorkspace: (...args: unknown[]) => mocks.workspace(...args),
}));

import {
  bootstrapStagingAcceptance,
  isStagingAcceptanceConfigured,
  stagingAcceptanceAuditExternalId,
} from "./staging-acceptance";

const session = {
  id: "auth0|owner-subject",
  email: " INFO@SLABBURGERS.COM ",
  emailVerified: false,
};

const stagingEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  SOCIALOLLA_ENV: "staging",
  APP_BASE_URL: "https://staging.socialolla.com",
  SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS: "true",
  SOCIALOLLA_STAGING_ACCEPTANCE_EMAILS: "info@slabburgers.com",
};

function configureTransaction() {
  mocks.transaction.mockImplementation((callback: (tx: unknown) => Promise<unknown>) => callback({
    user: {
      findUnique: (...args: unknown[]) => mocks.findUniqueUser(...args),
      findFirst: (...args: unknown[]) => mocks.findFirstUser(...args),
      create: (...args: unknown[]) => mocks.createUser(...args),
    },
  }));
}

describe("staging acceptance bootstrap guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureTransaction();
    vi.stubEnv("NODE_ENV", stagingEnvironment.NODE_ENV);
    vi.stubEnv("SOCIALOLLA_ENV", stagingEnvironment.SOCIALOLLA_ENV);
    vi.stubEnv("APP_BASE_URL", stagingEnvironment.APP_BASE_URL);
    vi.stubEnv("SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS", stagingEnvironment.SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS);
    vi.stubEnv("SOCIALOLLA_STAGING_ACCEPTANCE_EMAILS", stagingEnvironment.SOCIALOLLA_STAGING_ACCEPTANCE_EMAILS);
    mocks.findUniqueAudit.mockResolvedValue(null);
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
    mocks.workspace.mockResolvedValue({ dbId: "workspace-1", id: "wsp_public", label: "Personal workspace" });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("allows an unverified session only in the exact staging runtime", () => {
    expect(isStagingAcceptanceConfigured(session.email)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isStagingAcceptanceConfigured(session.email)).toBe(false);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    expect(isStagingAcceptanceConfigured(session.email)).toBe(false);
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("APP_BASE_URL", "https://socialolla.com");
    expect(isStagingAcceptanceConfigured(session.email)).toBe(false);
  });

  it("bootstraps a new exact subject as USER, one workspace, and one audit event", async () => {
    mocks.findUniqueUser.mockResolvedValue(null);
    mocks.findFirstUser.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue({ id: "user-1", authUserId: session.id, email: "info@slabburgers.com", role: "USER" });

    const result = await bootstrapStagingAcceptance(session);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted result");
    expect(result.acceptance).toBe("staging-bootstrap");
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        authUserId: session.id,
        email: "info@slabburgers.com",
        role: "USER",
      }),
    }));
    expect(mocks.workspace).toHaveBeenCalledTimes(1);
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: "STAGING_ACCEPTANCE_BOOTSTRAP",
        actorAuthUserId: session.id,
        workspaceId: "workspace-1",
        externalId: stagingAcceptanceAuditExternalId(session.id),
      }),
    }));
  });

  it("reuses an existing USER and existing audit/workspace without duplicating state", async () => {
    mocks.findUniqueUser.mockResolvedValue({ id: "user-1", authUserId: session.id, email: "info@slabburgers.com", role: "USER" });
    mocks.findUniqueAudit.mockResolvedValue({ id: "audit-1", eventType: "STAGING_ACCEPTANCE_BOOTSTRAP", actorAuthUserId: session.id });

    const result = await bootstrapStagingAcceptance(session);

    expect(result.status).toBe("accepted");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
    expect(mocks.workspace).toHaveBeenCalledTimes(1);
  });

  it("fails closed for an existing ADMIN and never creates workspace or audit state", async () => {
    mocks.findUniqueUser.mockResolvedValue({ id: "admin-1", authUserId: session.id, email: "info@slabburgers.com", role: "ADMIN" });

    const result = await bootstrapStagingAcceptance(session);

    expect(result).toEqual({ status: "blocked", reason: "admin-role" });
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("fails closed when another subject owns the normalized email", async () => {
    mocks.findUniqueUser.mockResolvedValue(null);
    mocks.findFirstUser.mockResolvedValue({ authUserId: "auth0|different-subject" });

    const result = await bootstrapStagingAcceptance(session);

    expect(result).toEqual({ status: "blocked", reason: "identity-conflict" });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it("fails closed when the flag, environment, or allowlist is invalid", async () => {
    const withoutFlag: NodeJS.ProcessEnv = { ...stagingEnvironment };
    delete withoutFlag.SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS;
    expect(isStagingAcceptanceConfigured(session.email, withoutFlag)).toBe(false);
    vi.stubEnv("SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS", "false");
    await expect(bootstrapStagingAcceptance(session)).resolves.toEqual({ status: "not-eligible" });
    vi.stubEnv("SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS", "true");
    vi.stubEnv("SOCIALOLLA_STAGING_ACCEPTANCE_EMAILS", "other@example.com");
    await expect(bootstrapStagingAcceptance(session)).resolves.toEqual({ status: "not-eligible" });
    vi.stubEnv("SOCIALOLLA_STAGING_ACCEPTANCE_EMAILS", "info@slabburgers.com");
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    await expect(bootstrapStagingAcceptance(session)).resolves.toEqual({ status: "not-eligible" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("fails closed for a changed subject instead of rebinding by email", async () => {
    mocks.findUniqueUser.mockResolvedValue(null);
    mocks.findFirstUser.mockResolvedValue({ authUserId: "auth0|original-subject" });

    const result = await bootstrapStagingAcceptance({ ...session, id: "auth0|changed-subject" });

    expect(result).toEqual({ status: "blocked", reason: "identity-conflict" });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("does not use the acceptance bootstrap for a provider-verified session", async () => {
    const result = await bootstrapStagingAcceptance({ ...session, emailVerified: true });

    expect(result).toEqual({ status: "not-eligible" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
