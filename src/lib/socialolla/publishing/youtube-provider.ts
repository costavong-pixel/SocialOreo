import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { createRemotePublishingProvider, type RemoteProviderContext, type RemoteProviderRequest } from "./remote-provider";
import { envUrl, providerReceipt } from "./adapter-helpers";

function buildRequest(context: RemoteProviderContext): RemoteProviderRequest {
  if (context.mediaBytes.length !== 1 || context.mediaKinds[0] !== "video") throw new Error("YouTube publishing requires one owned video asset");
  const metadata = JSON.stringify({ snippet: { title: context.title || context.text.slice(0, 100), description: context.text }, status: { privacyStatus: "public" } });
  const form = new FormData();
  form.append("metadata", new Blob([metadata], { type: "application/json" }), "metadata.json");
  const bytes = new Uint8Array(context.mediaBytes[0]);
  const exactBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  form.append("video", new Blob([exactBuffer], { type: context.mediaMimeTypes[0] || "video/mp4" }), "video");
  const path = `${envUrl("SOCIALOLLA_YOUTUBE_UPLOAD_URL", "https://www.googleapis.com/upload/youtube/v3/videos")}?part=snippet,status&uploadType=multipart`;
  return { url: path, init: { method: "POST", headers: { Authorization: `Bearer ${context.accessToken}`, Accept: "application/json" }, body: form }, receipt: (response) => providerReceipt("youtube", response, { url: path }) };
}

export function createYouTubePublishingProvider(storage: PrivateMediaStorage, fetcher?: typeof fetch) {
  return createRemotePublishingProvider("youtube", storage, buildRequest, fetcher);
}
