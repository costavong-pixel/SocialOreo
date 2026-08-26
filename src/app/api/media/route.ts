import { NextRequest, NextResponse } from "next/server";
import { detectMediaMimeType, mediaSizeLimitForMime, mediaLimits, type MediaKind } from "@/lib/socialolla/media/media";
import { createLocalPrivateMediaStorage } from "@/lib/socialolla/media/local-storage";
import { storeOwnedMedia } from "@/lib/socialolla/media/media-service";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  const multipartOverheadBytes = 2 * 1024 * 1024;
  if (Number.isFinite(contentLength) && contentLength > mediaLimits.videoBytes + multipartOverheadBytes) {
    return NextResponse.json({ error: "Media exceeds the size limit" }, { status: 413 });
  }
  const resolution = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(resolution)) return NextResponse.json({ error: "Account identity conflict" }, { status: 409 });
  if (!resolution) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "An image file is required" }, { status: 400 });
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > mediaSizeLimitForMime(file.type)) return NextResponse.json({ error: "Media exceeds the size limit" }, { status: 413 });
  const body = new Uint8Array(await file.arrayBuffer());
  const detected = detectMediaMimeType(body);
  const kind: MediaKind = detected?.startsWith("image/") ? "image" : detected?.startsWith("video/") ? "video" : "image";
  if (!detected) return NextResponse.json({ error: "Unsupported or invalid media bytes" }, { status: 415 });
  try {
    const asset = await storeOwnedMedia({ authUserId: resolution.dbId, kind, mimeType: file.type, detectedMimeType: detected, sizeBytes: body.byteLength, originalName: file.name, body, storage: createLocalPrivateMediaStorage() });
    return NextResponse.json({ assetId: asset.assetId, kind: asset.kind, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Media upload failed" }, { status: 400 });
  }
}
