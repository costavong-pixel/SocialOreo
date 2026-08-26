import { describe, expect, it, vi } from "vitest";
import { detectMediaMimeType, mediaLimits, mediaSizeLimitForMime, validateMediaDescriptor } from "./media";
import { createLocalPrivateMediaStorage, verifyMediaGrant } from "./local-storage";

describe("owned Post media", () => {
  it("detects bytes instead of trusting the browser MIME label", () => {
    expect(detectMediaMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectMediaMimeType(new TextEncoder().encode("not an image"))).toBeNull();
  });

  it("rejects MIME mismatches, oversize files, and path traversal", () => {
    expect(() => validateMediaDescriptor({ assetId: "med_1", ownerWorkspaceId: "wsp_1", kind: "image", mimeType: "image/png", detectedMimeType: "image/jpeg", sizeBytes: 10, originalName: "a.png", storageKey: "media/wsp_1/med_1" })).toThrow("MIME");
    expect(() => validateMediaDescriptor({ assetId: "med_1", ownerWorkspaceId: "wsp_1", kind: "image", mimeType: "image/jpeg", detectedMimeType: "image/jpeg", sizeBytes: mediaLimits.imageBytes + 1, originalName: "a.jpg", storageKey: "media/wsp_1/med_1" })).toThrow("size");
    expect(() => validateMediaDescriptor({ assetId: "med_1", ownerWorkspaceId: "wsp_1", kind: "image", mimeType: "image/jpeg", detectedMimeType: "image/jpeg", sizeBytes: 10, originalName: "a.jpg", storageKey: "media/wsp_1/../other" })).toThrow("storage");
  });

  it("chooses the early upload limit from the declared media family", () => {
    expect(mediaSizeLimitForMime("image/jpeg")).toBe(mediaLimits.imageBytes);
    expect(mediaSizeLimitForMime("video/mp4")).toBe(mediaLimits.videoBytes);
    expect(mediaSizeLimitForMime("")).toBe(mediaLimits.videoBytes);
  });

  it("creates short-lived signed grants and rejects tampering", async () => {
    vi.stubEnv("AUTH0_SECRET", "test-secret");
    vi.stubEnv("APP_URL", "https://staging.example.com");
    const descriptor = validateMediaDescriptor({ assetId: "med_1", ownerWorkspaceId: "wsp_1", kind: "image", mimeType: "image/jpeg", detectedMimeType: "image/jpeg", sizeBytes: 10, originalName: "a.jpg", storageKey: "media/wsp_1/med_1" });
    const grant = await createLocalPrivateMediaStorage().createControlledReadGrant({ descriptor, expiresInSeconds: 30 });
    const url = new URL(grant.grant);
    expect(url.origin).toBe("https://staging.example.com");
    expect(verifyMediaGrant("med_1", Number(url.searchParams.get("expires")), url.searchParams.get("signature")!)).toBe(true);
    expect(verifyMediaGrant("med_other", Number(url.searchParams.get("expires")), url.searchParams.get("signature")!)).toBe(false);
  });
});
