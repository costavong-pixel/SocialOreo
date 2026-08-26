import { createHash } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";

const STAGING_ENVIRONMENT = "staging";
const STAGING_ORIGIN = "https://staging.socialolla.com";
const STAGING_BOOTSTRAP_EVENT = "STAGING_ACCEPTANCE_BOOTSTRAP";
const MAX_SERIALIZABLE_RETRIES = 2;

export type StagingAcceptanceSession = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName?: string | null;
};

export type StagingAcceptanceResult =
  | {
      status: "accepted";
      acceptance: "staging-bootstrap";
      userId: string;
      authUserId: string;
      email: string;
      workspaceId: string;
      auditExternalId: string;
    }
  | { status: "not-eligible" }
  | { status: "blocked"; reason: "identity-conflict" | "admin-role" };

export type StagingAcceptanceProfileState = "active" | "recorded-disabled" | "not-active";

function configuredValue(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

export function normalizeStagingAcceptanceEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isStagingAcceptanceRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  const configuredEnvironment = configuredValue(env, "SOCIALOLLA_ENV").toLowerCase();
  const configuredOrigin = configuredValue(env, "APP_BASE_URL").replace(/\/$/, "");

  // The staging service intentionally runs Next with NODE_ENV=production for a
  // production build. SOCIALOLLA_ENV and the exact staging origin are the
  // deployment boundary; a production SOCIALOLLA_ENV can never pass.
  return configuredEnvironment === STAGING_ENVIRONMENT && configuredOrigin === STAGING_ORIGIN;
}

export function stagingAcceptanceAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    configuredValue(env, "SOCIALOLLA_STAGING_ACCEPTANCE_EMAILS")
      .split(",")
      .map(normalizeStagingAcceptanceEmail)
      .filter(Boolean),
  );
}

export function isStagingAcceptanceConfigured(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isStagingAcceptanceRuntime(env)) return false;
  if (configuredValue(env, "SOCIALOLLA_STAGING_ACCEPTANCE_AUTH_BYPASS") !== "true") return false;
  if (!email) return false;
  return stagingAcceptanceAllowlist(env).has(normalizeStagingAcceptanceEmail(email));
}

export function stagingAcceptanceAuditExternalId(authUserId: string): string {
  const subjectFingerprint = createHash("sha256").update(authUserId).digest("hex").slice(0, 32);
  return `evt_staging_acceptance_${subjectFingerprint}`;
}

function isSerializableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Bootstrap is deliberately separate from the normal verified-email sync.
 * It is only an acceptance fixture for the explicitly configured staging
 * cohort; the exact Auth0 subject remains the only identity key.
 */
export async function bootstrapStagingAcceptance(
  session: StagingAcceptanceSession,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StagingAcceptanceResult> {
  const authUserId = session.id.trim();
  const email = session.email ? normalizeStagingAcceptanceEmail(session.email) : "";

  if (session.emailVerified || !authUserId || !email || !isStagingAcceptanceConfigured(email, env)) {
    return { status: "not-eligible" };
  }

  let user: { id: string; authUserId: string; email: string; role: UserRole } | null = null;
  for (let attempt = 0; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      const transactionResult = await prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { authUserId },
          select: { id: true, authUserId: true, email: true, role: true },
        });

        if (existingUser) {
          // An existing ADMIN must never become an accepted staging USER by
          // inheritance. Fail closed rather than demoting or granting access.
          if (existingUser.role === UserRole.ADMIN) {
            return { status: "blocked", reason: "admin-role" } as const;
          }

          if (normalizeStagingAcceptanceEmail(existingUser.email) !== email) {
            const emailOwner = await tx.user.findFirst({
              where: {
                email: { equals: email, mode: "insensitive" },
                NOT: { authUserId },
              },
              select: { authUserId: true },
            });
            if (emailOwner) return { status: "blocked", reason: "identity-conflict" } as const;
          }

          const updated = normalizeStagingAcceptanceEmail(existingUser.email) === email
            ? existingUser
            : await tx.user.update({
                where: { authUserId },
                data: { email },
                select: { id: true, authUserId: true, email: true, role: true },
              });
          return { status: "user", user: updated } as const;
        }

        const emailOwner = await tx.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { authUserId: true },
        });
        if (emailOwner) return { status: "blocked", reason: "identity-conflict" } as const;

        const created = await tx.user.create({
          data: {
            authUserId,
            email,
            role: UserRole.USER,
            creditAccount: { create: { balance: 0 } },
          },
          select: { id: true, authUserId: true, email: true, role: true },
        });
        return { status: "user", user: created } as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (transactionResult.status === "blocked") return transactionResult;
      user = transactionResult.user;
      break;
    } catch (error) {
      if (isSerializableTransactionError(error) && attempt < MAX_SERIALIZABLE_RETRIES) continue;
      if (isUniqueConflict(error)) return { status: "blocked", reason: "identity-conflict" };
      throw error;
    }
  }

  if (!user) throw new Error("Staging acceptance bootstrap did not resolve a user.");
  const workspace = await getOrCreatePersonalWorkspace(user.id);
  const auditExternalId = stagingAcceptanceAuditExternalId(authUserId);
  const existingAudit = await prisma.auditEvent.findUnique({
    where: { externalId: auditExternalId },
    select: { id: true, eventType: true, actorAuthUserId: true },
  });

  if (!existingAudit) {
    try {
      await prisma.auditEvent.create({
        data: {
          externalId: auditExternalId,
          workspaceId: workspace.dbId,
          actorAuthUserId: authUserId,
          eventType: STAGING_BOOTSTRAP_EVENT,
          payload: {
            provider: "Auth0",
            providerEmailVerified: false,
            acceptanceMode: "staging-only",
          },
        },
      });
    } catch (error) {
      // The subject fingerprint is a deterministic unique key, so a
      // concurrent bootstrap can safely treat P2002 as the same audit event.
      if (!isUniqueConflict(error)) throw error;
    }
  }

  return {
    status: "accepted",
    acceptance: "staging-bootstrap",
    userId: user.id,
    authUserId: user.authUserId,
    email: user.email,
    workspaceId: workspace.dbId,
    auditExternalId,
  };
}

export async function loadStagingAcceptanceProfileState(
  authUserId: string,
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StagingAcceptanceProfileState> {
  if (!isStagingAcceptanceRuntime(env)) return "not-active";

  const auditExternalId = stagingAcceptanceAuditExternalId(authUserId);
  const audit = await prisma.auditEvent.findUnique({
    where: { externalId: auditExternalId },
    select: { eventType: true, actorAuthUserId: true },
  });
  if (!audit || audit.eventType !== STAGING_BOOTSTRAP_EVENT || audit.actorAuthUserId !== authUserId) {
    return "not-active";
  }
  return isStagingAcceptanceConfigured(email, env) ? "active" : "recorded-disabled";
}

export const STAGING_ACCEPTANCE_BOOTSTRAP_EVENT = STAGING_BOOTSTRAP_EVENT;
