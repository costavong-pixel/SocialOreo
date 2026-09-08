import { describe, expect, it, vi } from "vitest";
import {
  assertStagingFixtureEnvironment,
  ensureStagingProviderDisabledDestination,
  STAGING_FIXTURE_LABEL,
  stagingDestinationExternalId,
  type StagingFixtureDb,
} from "@/lib/socialolla/staging/provider-disabled-destination-fixture";

const env = {
  SOCIALOLLA_ENV: "staging",
  APP_ENV: "staging",
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://staging.example/socialoreo_staging",
  STAGING_AUTH0_SUBJECT: "auth0|staging-subject",
  STAGING_WORKSPACE_EXTERNAL_ID: "wsp_staging_workspace",
  STAGING_EXPECTED_EMAIL: "info@slabburgers.com",
};

function makeDb(existing: Record<string, unknown> | null = null): StagingFixtureDb {
  const destination = existing as never;
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", email: "info@slabburgers.com", role: "USER" }) },
    workspace: { findUnique: vi.fn().mockResolvedValue({ id: "workspace-1", externalId: "wsp_staging_workspace", ownerUserId: "user-1" }) },
    destination: {
      findUnique: vi.fn().mockResolvedValue(destination),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("staging provider-disabled destination fixture", () => {
  it.each([
    ["non-staging app", { ...env, SOCIALOLLA_ENV: "development" }],
    ["production app", { ...env, APP_ENV: "production" }],
    ["production database", { ...env, DATABASE_URL: "postgresql://db/socialoreo_prod" }],
    ["missing subject", { ...env, STAGING_AUTH0_SUBJECT: "" }],
    ["missing workspace", { ...env, STAGING_WORKSPACE_EXTERNAL_ID: "" }],
  ])("refuses %s", (_name, candidate) => {
    expect(() => assertStagingFixtureEnvironment(candidate)).toThrow();
  });

  it("creates one explicit connected provider-disabled Instagram fixture", async () => {
    const db = makeDb();
    const result = await ensureStagingProviderDisabledDestination(env, db);
    expect(result).toMatchObject({
      created: true,
      workspaceExternalId: "wsp_staging_workspace",
      destinationExternalId: stagingDestinationExternalId("wsp_staging_workspace"),
      label: STAGING_FIXTURE_LABEL,
      platform: "INSTAGRAM",
      status: "CONNECTED",
      providerDisabled: true,
      accessTokenPresent: false,
    });
    expect(db.destination.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        platform: "instagram",
        status: "CONNECTED",
        providerDisabled: true,
        accessTokenCiphertext: null,
        publishingEligibilityVerifiedAt: null,
        scopes: [],
      }),
    });
  });

  it("returns the safe existing fixture without creating a duplicate", async () => {
    const db = makeDb({
      id: "destination-1",
      externalId: stagingDestinationExternalId("wsp_staging_workspace"),
      workspaceId: "workspace-1",
      label: STAGING_FIXTURE_LABEL,
      platform: "instagram",
      status: "CONNECTED",
      providerDisabled: true,
      accessTokenCiphertext: null,
      accessTokenExpiresAt: null,
      publishingEligibilityVerifiedAt: null,
      scopes: [],
    });
    const result = await ensureStagingProviderDisabledDestination(env, db);
    expect(result.created).toBe(false);
    expect(db.destination.create).not.toHaveBeenCalled();
  });

  it("fails closed when the reserved fixture has a token or another workspace", async () => {
    const withToken = makeDb({
      id: "destination-1",
      externalId: stagingDestinationExternalId("wsp_staging_workspace"),
      workspaceId: "workspace-1",
      label: STAGING_FIXTURE_LABEL,
      platform: "instagram",
      status: "CONNECTED",
      providerDisabled: true,
      accessTokenCiphertext: "ciphertext",
      accessTokenExpiresAt: null,
      publishingEligibilityVerifiedAt: null,
      scopes: [],
    });
    await expect(ensureStagingProviderDisabledDestination(env, withToken)).rejects.toThrow(/safe provider-disabled state/);

    const wrongWorkspace = makeDb();
    wrongWorkspace.workspace.findUnique = vi.fn().mockResolvedValue({ id: "workspace-2", externalId: "wsp_staging_workspace", ownerUserId: "user-2" });
    await expect(ensureStagingProviderDisabledDestination(env, wrongWorkspace)).rejects.toThrow(/not owned/);
  });
});
