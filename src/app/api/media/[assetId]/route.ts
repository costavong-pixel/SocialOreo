import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createLocalPrivateMediaStorage, verifyMediaGrant } from "@/lib/socialolla/media/local-storage";

export async function GET(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  const expires = Number(request.nextUrl.searchParams.get("expires"));
  const signature = request.nextUrl.searchParams.get("signature") ?? "";
  if (!verifyMediaGrant(assetId, expires, signature)) return NextResponse.json({ error: "Invalid or expired media grant" }, { status: 403 });
  const asset = await prisma.mediaAsset.findFirst({ where: { externalId: assetId, status: "READY" } });
  if (!asset) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  try {
    const body = await createLocalPrivateMediaStorage().read({ assetId: asset.externalId, ownerWorkspaceId: "grant", kind: asset.kind as "image" | "video", mimeType: asset.mimeType, detectedMimeType: asset.detectedMimeType, sizeBytes: asset.sizeBytes, originalName: asset.originalName, storageKey: asset.storageKey });
    return new NextResponse(body as BodyInit, { headers: { "Content-Type": asset.mimeType, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Media storage is unavailable" }, { status: 503 });
  }
}
