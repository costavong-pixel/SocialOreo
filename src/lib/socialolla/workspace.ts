import { prisma } from "@/lib/db/prisma";
import { workspaceSchema } from "@/lib/socialolla/contracts";

const EXTERNAL_PREFIX = "wsp_";

function randomExternalId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 22; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function newWorkspaceExternalId(): string {
  return `${EXTERNAL_PREFIX}${randomExternalId()}`;
}

/**
 * One-personal-workspace wrapper, created lazily on first access (no backfill).
 * Fail-closed: the owner is always derived from the authenticated session and
 * never client-supplied. The workspace is 1:1 bound to a single User row.
 */
export async function getOrCreatePersonalWorkspace(ownerUserId: string, label?: string) {
  const existing = await prisma.workspace.findUnique({
    where: { ownerUserId },
    include: {
      destinations: { orderBy: { createdAt: "asc" } },
      entitlementSnapshots: { orderBy: { validFrom: "desc" }, take: 1 },
      creditBatches: { orderBy: { createdAt: "asc" } },
    },
  });
  if (existing) {
    return workspaceSchema.parse({
      id: existing.externalId,
      ownerAuthUserId: existing.ownerUserId,
      label: existing.label,
      defaultLocale: existing.defaultLocale,
      createdAt: existing.createdAt.toISOString(),
    });
  }

  const created = await prisma.workspace.create({
    data: {
      externalId: newWorkspaceExternalId(),
      ownerUserId,
      label: label?.trim() || "Personal workspace",
      defaultLocale: "en-US",
      provider: "PERSONAL",
    },
  });
  return workspaceSchema.parse({
    id: created.externalId,
    ownerAuthUserId: created.ownerUserId,
    label: created.label,
    defaultLocale: created.defaultLocale,
    createdAt: created.createdAt.toISOString(),
  });
}
