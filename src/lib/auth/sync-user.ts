import { Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getAcceptedSessionUser } from "@/lib/auth/current-user";
import { connectionProviderFromSubject, logAuthSyncDiagnostic } from "@/lib/auth/auth-sync-diagnostics";

type Auth0User = {
  id: string;
  email: string;
};

const MAX_SERIALIZABLE_RETRIES = 2;

export class AuthIdentityCollisionError extends Error {
  constructor() {
    super("This verified email is already associated with a different sign-in identity.");
    this.name = "AuthIdentityCollisionError";
  }
}

export function isAuthIdentityCollisionError(error: unknown): error is AuthIdentityCollisionError {
  return error instanceof AuthIdentityCollisionError;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isSerializableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

export async function syncUserFromAuth0(authUser: Auth0User) {
  const email = normalizeEmail(authUser.email);

  for (let attempt = 0; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      const synced = await prisma.$transaction(async (tx) => {
        // Auth0 subject is the account identity. An email match alone must never
        // inherit an existing account's role, credits, workspace, or purchases.
        const existingUser = await tx.user.findUnique({
          where: { authUserId: authUser.id },
          select: { id: true, email: true },
        });

        if (existingUser) {
          // Historical environments can already have multiple legacy Auth0
          // subjects with one email. Keep a known subject usable; only guard a
          // request that would change it to another subject's email.
          if (normalizeEmail(existingUser.email) !== email) {
            const emailOwner = await tx.user.findFirst({
              where: {
                email: {
                  equals: email,
                  mode: "insensitive",
                },
                NOT: { authUserId: authUser.id },
              },
              select: { authUserId: true },
            });

            if (emailOwner) throw new AuthIdentityCollisionError();
          }

          return {
            user: await tx.user.update({
              where: { authUserId: authUser.id },
              data: { email },
              include: { creditAccount: true },
            }),
            result: "existing" as const,
          };
        }

        const emailOwner = await tx.user.findFirst({
          where: {
            email: {
              equals: email,
              mode: "insensitive",
            },
          },
          select: { authUserId: true },
        });

        if (emailOwner) throw new AuthIdentityCollisionError();

        return {
          user: await tx.user.create({
            data: {
              authUserId: authUser.id,
              email,
              role: UserRole.USER,
              creditAccount: {
                create: {
                  balance: 0,
                },
              },
            },
            include: {
              creditAccount: true,
            },
          }),
          result: "created" as const,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      logAuthSyncDiagnostic("sync", {
        subject: authUser.id,
        email,
        connectionProvider: connectionProviderFromSubject(authUser.id),
        syncResult: synced.result,
      });
      return synced.user;
    } catch (error) {
      if (isSerializableTransactionError(error) && attempt < MAX_SERIALIZABLE_RETRIES) {
        continue;
      }

      logAuthSyncDiagnostic("sync", {
        subject: authUser.id,
        email,
        connectionProvider: connectionProviderFromSubject(authUser.id),
        syncResult: isAuthIdentityCollisionError(error) ? "conflict" : "failed",
        errorKind: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "unknown",
      });
      throw error;
    }
  }

  throw new Error("Unreachable identity-sync retry state.");
}

export type ResolvedDbUser = {
  dbId: string;
  authUserId: string;
  email: string;
};

export type DbSessionResolution = ResolvedDbUser | { status: "identity-conflict" } | null;

export function hasDbSessionIdentityConflict(
  resolution: DbSessionResolution,
): resolution is { status: "identity-conflict" } {
  return resolution !== null && "status" in resolution && resolution.status === "identity-conflict";
}

/**
 * Resolve a provider-verified or explicitly staging-accepted session to the DB User row. Workspace.ownerUserId
 * references User.id (the DB primary key), NOT the Auth0 sub, so every
 * workspace-scoped page/action must use dbUserId for ownership keys.
 *
 * A verified-email collision is fail-closed and represented separately from a
 * missing session so callers can direct the user to support without retrying
 * Auth0 or creating a second account row.
 */
export async function resolveDbUserFromVerifiedSession(): Promise<DbSessionResolution> {
  const sessionUser = await getAcceptedSessionUser();
  if (!sessionUser) {
    logAuthSyncDiagnostic("sync", { syncResult: "skipped-unverified" });
    return null;
  }

  try {
    const dbUser = await syncUserFromAuth0({ id: sessionUser.id, email: sessionUser.email });
    return { dbId: dbUser.id, authUserId: dbUser.authUserId, email: dbUser.email };
  } catch (error) {
    if (isAuthIdentityCollisionError(error)) return { status: "identity-conflict" };
    throw error;
  }
}
