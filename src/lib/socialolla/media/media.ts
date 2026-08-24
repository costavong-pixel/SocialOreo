export type MediaKind = "image" | "video";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 180;

const MIME_BY_KIND: Record<MediaKind, ReadonlySet<string>> = {
  image: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  video: new Set(["video/mp4", "video/quicktime", "video/webm"]),
};

export type MediaDescriptor = {
  assetId: string;
  ownerWorkspaceId: string;
  kind: MediaKind;
  mimeType: string;
  detectedMimeType: string;
  sizeBytes: number;
  originalName: string;
  storageKey: string;
};

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export function detectMediaMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a") return "image/gif";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  return null;
}

function safeSegment(value: string): boolean {
  return Boolean(value) && value !== "." && value !== ".." && !/[\\/\0\u0000-\u001f\u007f]/.test(value);
}

function safeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!safeSegment(normalized) || normalized.length > 120 || /[^a-zA-Z0-9_-]/.test(normalized)) throw new MediaValidationError(`${label} is invalid`);
  return normalized;
}

function safeFilename(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_FILENAME_LENGTH || !safeSegment(normalized)) throw new MediaValidationError("Media filename is invalid");
  return normalized;
}

function safeStorageKey(value: string, ownerWorkspaceId: string): string {
  const normalized = value.trim().replace(/\\/g, "/");
  const prefix = `media/${ownerWorkspaceId}/`;
  if (!normalized.startsWith(prefix) || normalized.includes("..") || normalized.includes(":") || normalized.startsWith("/")) throw new MediaValidationError("Media storage key must remain in the private workspace namespace");
  if (normalized.split("/").some((segment) => !safeSegment(segment))) throw new MediaValidationError("Media storage key contains an unsafe segment");
  return normalized;
}

export function privateMediaStorageKey(ownerWorkspaceId: string, assetId: string): string {
  return `media/${safeIdentifier(ownerWorkspaceId, "Workspace")}/${safeIdentifier(assetId, "Asset")}`;
}

export function validateMediaDescriptor(input: {
  assetId: string;
  ownerWorkspaceId: string;
  kind: MediaKind;
  mimeType: string;
  detectedMimeType: string;
  sizeBytes: number;
  originalName: string;
  storageKey: string;
}): MediaDescriptor {
  const assetId = safeIdentifier(input.assetId, "Asset");
  const ownerWorkspaceId = safeIdentifier(input.ownerWorkspaceId, "Workspace");
  const mimeType = input.mimeType.trim().toLowerCase();
  const detectedMimeType = input.detectedMimeType.trim().toLowerCase();
  const allowed = MIME_BY_KIND[input.kind];
  if (!allowed || !allowed.has(mimeType) || !allowed.has(detectedMimeType) || mimeType !== detectedMimeType) throw new MediaValidationError("Media MIME type does not match the allowed content type");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) throw new MediaValidationError("Media size is invalid");
  const maximum = input.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (input.sizeBytes > maximum) throw new MediaValidationError("Media exceeds the size limit");
  return { assetId, ownerWorkspaceId, kind: input.kind, mimeType, detectedMimeType, sizeBytes: input.sizeBytes, originalName: safeFilename(input.originalName), storageKey: safeStorageKey(input.storageKey, ownerWorkspaceId) };
}

export interface PrivateMediaStorage {
  put(input: { descriptor: MediaDescriptor; body: Uint8Array }): Promise<MediaDescriptor>;
  read(descriptor: MediaDescriptor): Promise<Buffer>;
  createControlledReadGrant(input: { descriptor: MediaDescriptor; expiresInSeconds: number }): Promise<{ grant: string; expiresAt: Date }>;
}

export const mediaLimits = Object.freeze({ imageBytes: MAX_IMAGE_BYTES, videoBytes: MAX_VIDEO_BYTES, filenameLength: MAX_FILENAME_LENGTH });
