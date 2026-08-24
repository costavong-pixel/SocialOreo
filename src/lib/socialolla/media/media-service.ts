import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { privateMediaStorageKey, validateMediaDescriptor, type MediaDescriptor, type MediaKind, type PrivateMediaStorage } from "./media";

function newMediaAssetExternalId(): string {
  return `med_${randomBytes(12).toString("base64url")}`;
}

export async function storeOwnedMedia(input: {
  authUserId: string;
  kind: MediaKind;
  mimeType: string;
  detectedMimeType: string;
  sizeBytes: number;
  originalName: string;
  body: Uint8Array;
  storage: PrivateMediaStorage;
}): Promise<MediaDescriptor> {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const assetId = newMediaAssetExternalId();
  if (input.body.byteLength !== input.sizeBytes) throw new Error("Media body size does not match the declared size");
  const descriptor = validateMediaDescriptor({ assetId, ownerWorkspaceId: workspace.id, kind: input.kind, mimeType: input.mimeType, detectedMimeType: input.detectedMimeType, sizeBytes: input.sizeBytes, originalName: input.originalName, storageKey: privateMediaStorageKey(workspace.id, assetId) });
  const stored = await input.storage.put({ descriptor, body: input.body });
  const persisted = await prisma.mediaAsset.create({
    data: { externalId: stored.assetId, workspaceId: workspace.dbId, kind: stored.kind, mimeType: stored.mimeType, detectedMimeType: stored.detectedMimeType, sizeBytes: stored.sizeBytes, originalName: stored.originalName, storageKey: stored.storageKey, status: "READY" },
  });
  return { assetId: persisted.externalId, ownerWorkspaceId: workspace.id, kind: persisted.kind as MediaKind, mimeType: persisted.mimeType, detectedMimeType: persisted.detectedMimeType, sizeBytes: persisted.sizeBytes, originalName: persisted.originalName, storageKey: persisted.storageKey };
}

export async function getOwnedMedia(input: { authUserId: string; assetId: string }): Promise<MediaDescriptor | null> {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const row = await prisma.mediaAsset.findFirst({ where: { externalId: input.assetId, workspaceId: workspace.dbId, status: "READY" } });
  if (!row) return null;
  return { assetId: row.externalId, ownerWorkspaceId: workspace.id, kind: row.kind as MediaKind, mimeType: row.mimeType, detectedMimeType: row.detectedMimeType, sizeBytes: row.sizeBytes, originalName: row.originalName, storageKey: row.storageKey };
}

export async function createOwnedMediaReadGrant(input: { authUserId: string; assetId: string; expiresInSeconds: number; storage: PrivateMediaStorage }) {
  const descriptor = await getOwnedMedia(input);
  if (!descriptor) throw new Error("Media asset not found for this workspace");
  return input.storage.createControlledReadGrant({ descriptor, expiresInSeconds: input.expiresInSeconds });
}

export async function deleteOwnedMedia(input: { authUserId: string; assetId: string }) {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const asset = await prisma.mediaAsset.findFirst({ where: { externalId: input.assetId, workspaceId: workspace.dbId, status: "READY" } });
  if (!asset) return { deleted: false };
  const variants = await prisma.postVariant.findMany({ where: { postRequest: { workspaceId: workspace.dbId }, mediaAssetIds: { has: asset.externalId } }, select: { id: true } });
  if (variants.length > 0) throw new Error("Media is attached to a Post; replace it before deleting it.");
  await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "DELETED" } });
  return { deleted: true };
}
