import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const EXTERNAL_PREFIX = "wsp_";

function randomExternalId(): string {
  return randomBytes(12).toString("base64url");
}

export function newWorkspaceExternalId(): string {
  return `${EXTERNAL_PREFIX}${randomExternalId()}`;
}

/**
 * One-personal-workspace wrapper, created lazily on first access (no backfill).
 * Fail-closed: the owner is always derived from the authenticated session and
 * never client-supplied. The workspace is 1:1 bound to a single User row.
 * Race-safe: a concurrent first access retries on the unique-owner conflict.
 *
 * Returns both the canonical contract (externalId) and the internal database
 * primary key so DB operations can use the correct FK. An optional db/client
 * lets callers run the create inside an enclosing transaction.
 */
export async function getOrCreatePersonalWorkspace(
  ownerUserId: string,
  label?: string,
  db: { workspace: { findUnique: typeof prisma.workspace.findUnique; create: typeof prisma.workspace.create } } = prisma,
) {
  const existing = await db.workspace.findUnique({
    where: { ownerUserId },
  });
  if (existing) {
    return toWorkspace(existing);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await db.workspace.create({
        data: {
          externalId: newWorkspaceExternalId(),
          ownerUserId,
          label: label?.trim() || "Personal workspace",
          defaultLocale: "en-US",
          provider: "PERSONAL",
        },
      });
      return toWorkspace(created);
    } catch (error) {
      const isUniqueConflict =
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
      if (isUniqueConflict && attempt < 2) {
        const winner = await db.workspace.findUnique({ where: { ownerUserId } });
        if (winner) return toWorkspace(winner);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not create personal workspace");
}

function toWorkspace(workspace: { id: string; externalId: string; ownerUserId: string; label: string; defaultLocale: string; createdAt: Date }) {
  return {
    id: workspace.externalId,
    dbId: workspace.id,
    ownerAuthUserId: workspace.ownerUserId,
    label: workspace.label,
    defaultLocale: workspace.defaultLocale,
    createdAt: workspace.createdAt.toISOString(),
  };
}
