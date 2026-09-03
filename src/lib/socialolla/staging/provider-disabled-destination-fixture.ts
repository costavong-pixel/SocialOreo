import { createHash } from "node:crypto";

export const STAGING_FIXTURE_LABEL = "STAGING TEST Instagram (provider-disabled)";
export const STAGING_FIXTURE_ACCOUNT_LABEL = "@socialolla-staging-provider-disabled";

type UserRow = { id: string; email: string; role: string };
type WorkspaceRow = { id: string; externalId: string; ownerUserId: string };
type DestinationRow = {
  id: string;
  externalId: string;
  workspaceId: string;
  label: string;
  platform: string;
  status: string;
  providerDisabled: boolean;
  accessTokenCiphertext: string | null;
  accessTokenExpiresAt: Date | null;
  publishingEligibilityVerifiedAt: Date | null;
  scopes: string[];
};

export type StagingFixtureDb = {
  user: {
    findUnique: (...args: any[]) => Promise<UserRow | null>;
  };
  workspace: {
    findUnique: (...args: any[]) => Promise<WorkspaceRow | null>;
  };
  destination: {
    findUnique: (...args: any[]) => Promise<DestinationRow | null>;
    findFirst: (...args: any[]) => Promise<DestinationRow | null>;
    create: (...args: any[]) => Promise<DestinationRow>;
  };
};

export type StagingFixtureEnvironment = {
  SOCIALOLLA_ENV?: string;
  APP_ENV?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
  STAGING_AUTH0_SUBJECT?: string;
  STAGING_WORKSPACE_EXTERNAL_ID?: string;
  STAGING_EXPECTED_EMAIL?: string;
};

function normalized(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isProductionDatabaseUrl(value: string): boolean {
  return /production|(?:^|[^a-z])prod(?:[^a-z]|$)/i.test(value);
}

export function assertStagingFixtureEnvironment(env: StagingFixtureEnvironment): {
  authUserId: string;
  workspaceExternalId: string;
  expectedEmail: string | null;
} {
  if (normalized(env.SOCIALOLLA_ENV).toLowerCase() !== "staging") {
    throw new Error("Refusing staging fixture unless SOCIALOLLA_ENV=staging.");
  }
  if (normalized(env.APP_ENV).toLowerCase() === "production" || normalized(env.NODE_ENV).toLowerCase() === "production") {
    throw new Error("Refusing staging fixture in a production application environment.");
  }
  const databaseUrl = normalized(env.DATABASE_URL);
  if (!databaseUrl || isProductionDatabaseUrl(databaseUrl)) {
    throw new Error("Refusing staging fixture against an unapproved database URL.");
  }
  const authUserId = normalized(env.STAGING_AUTH0_SUBJECT);
  if (!authUserId) throw new Error("STAGING_AUTH0_SUBJECT is required; do not guess an Auth0 subject.");
  const workspaceExternalId = normalized(env.STAGING_WORKSPACE_EXTERNAL_ID);
  if (!workspaceExternalId) throw new Error("STAGING_WORKSPACE_EXTERNAL_ID is required; do not guess a workspace.");
  const expectedEmail = normalized(env.STAGING_EXPECTED_EMAIL).toLowerCase();
  return { authUserId, workspaceExternalId, expectedEmail: expectedEmail || null };
}

export function stagingDestinationExternalId(workspaceExternalId: string): string {
  const fingerprint = createHash("sha256").update(workspaceExternalId).digest("hex").slice(0, 24);
  return `dst_staging_provider_disabled_${fingerprint}`;
}

function isSafeFixture(row: DestinationRow, workspaceId: string, externalId: string): boolean {
  return row.externalId === externalId
    && row.workspaceId === workspaceId
    && row.label === STAGING_FIXTURE_LABEL
    && row.platform.toLowerCase() === "instagram"
    && row.status === "CONNECTED"
    && row.providerDisabled
    && !row.accessTokenCiphertext
    && !row.accessTokenExpiresAt
    && !row.publishingEligibilityVerifiedAt
    && row.scopes.length === 0;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002";
}

export async function ensureStagingProviderDisabledDestination(
  env: StagingFixtureEnvironment,
  db: StagingFixtureDb,
): Promise<{
  environment: "staging";
  created: boolean;
  workspaceExternalId: string;
  destinationExternalId: string;
  label: string;
  platform: "INSTAGRAM";
  status: "CONNECTED";
  providerDisabled: true;
  accessTokenPresent: false;
}> {
  const config = assertStagingFixtureEnvironment(env);
  const user = await db.user.findUnique({
    where: { authUserId: config.authUserId },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new Error("The supplied staging Auth0 subject is not present in the staging database.");
  if (config.expectedEmail && user.email.trim().toLowerCase() !== config.expectedEmail) {
    throw new Error("The supplied staging Auth0 subject does not match STAGING_EXPECTED_EMAIL.");
  }

  const workspace = await db.workspace.findUnique({
    where: { externalId: config.workspaceExternalId },
    select: { id: true, externalId: true, ownerUserId: true },
  });
  if (!workspace) throw new Error("The supplied staging workspace is not present in the staging database.");
  if (workspace.ownerUserId !== user.id) throw new Error("The supplied staging workspace is not owned by the supplied staging identity.");

  const destinationExternalId = stagingDestinationExternalId(workspace.externalId);
  const existing = await db.destination.findUnique({
    where: { externalId: destinationExternalId },
    select: {
      id: true,
      externalId: true,
      workspaceId: true,
      label: true,
      platform: true,
      status: true,
      providerDisabled: true,
      accessTokenCiphertext: true,
      accessTokenExpiresAt: true,
      publishingEligibilityVerifiedAt: true,
      scopes: true,
    },
  });
  if (existing) {
    if (!isSafeFixture(existing, workspace.id, destinationExternalId)) {
      throw new Error("The reserved staging fixture exists but is not in the safe provider-disabled state.");
    }
    return {
      environment: "staging",
      created: false,
      workspaceExternalId: workspace.externalId,
      destinationExternalId,
      label: STAGING_FIXTURE_LABEL,
      platform: "INSTAGRAM",
      status: "CONNECTED",
      providerDisabled: true,
      accessTokenPresent: false,
    };
  }

  const conflictingLabel = await db.destination.findFirst({
    where: { workspaceId: workspace.id, label: STAGING_FIXTURE_LABEL },
    select: {
      id: true,
      externalId: true,
      workspaceId: true,
      label: true,
      platform: true,
      status: true,
      providerDisabled: true,
      accessTokenCiphertext: true,
      accessTokenExpiresAt: true,
      publishingEligibilityVerifiedAt: true,
      scopes: true,
    },
  });
  if (conflictingLabel) throw new Error("A staging provider-disabled fixture already exists under an unexpected external ID.");

  const data = {
    externalId: destinationExternalId,
    workspaceId: workspace.id,
    label: STAGING_FIXTURE_LABEL,
    platform: "instagram",
    platformUserId: null,
    accountLabel: STAGING_FIXTURE_ACCOUNT_LABEL,
    status: "CONNECTED",
    providerDisabled: true,
    accessTokenCiphertext: null,
    accessTokenExpiresAt: null,
    publishingEligibilityVerifiedAt: null,
    scopes: [],
  };
  try {
    await db.destination.create({ data });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const concurrent = await db.destination.findUnique({
      where: { externalId: destinationExternalId },
      select: {
        id: true,
        externalId: true,
        workspaceId: true,
        label: true,
        platform: true,
        status: true,
        providerDisabled: true,
        accessTokenCiphertext: true,
        accessTokenExpiresAt: true,
        publishingEligibilityVerifiedAt: true,
        scopes: true,
      },
    });
    if (concurrent && isSafeFixture(concurrent, workspace.id, destinationExternalId)) {
      return {
        environment: "staging",
        created: false,
        workspaceExternalId: workspace.externalId,
        destinationExternalId,
        label: STAGING_FIXTURE_LABEL,
        platform: "INSTAGRAM",
        status: "CONNECTED",
        providerDisabled: true,
        accessTokenPresent: false,
      };
    }
    throw new Error("A concurrent staging fixture write did not produce the safe reserved fixture.");
  }

  return {
    environment: "staging",
    created: true,
    workspaceExternalId: workspace.externalId,
    destinationExternalId,
    label: STAGING_FIXTURE_LABEL,
    platform: "INSTAGRAM",
    status: "CONNECTED",
    providerDisabled: true,
    accessTokenPresent: false,
  };
}
