import { describe, expect, it } from "vitest";
import { toPostListView } from "./post-view";

describe("post customer DTO", () => {
  it("drops destination credentials and publish internals", () => {
    const view = toPostListView({
      id: "post-internal",
      externalId: "post_public",
      destinationRef: "dst_public",
      language: "en",
      status: "REVIEW",
      variants: [{ id: "variant-internal", platform: "instagram", title: "Title", caption: "Caption", hashtags: [], cta: null, isFinal: false, variantLocale: "en-US", mediaAssetIds: [] }],
      occurrences: [{ id: "occurrence-internal", status: "IDEA", scheduleAt: null, timezone: "UTC", destinationRef: "dst_public" }],
      destinations: [{ externalId: "postdst_public", platform: "instagram", status: "PENDING", publishJobs: [{ id: "job-internal", status: "QUEUED", receipt: null }] }],
      ...({ accessTokenCiphertext: "secret", scopes: ["publish"], attempts: [{ error: "internal" }], idempotencyKey: "secret" } as Record<string, unknown>),
    } as unknown as Parameters<typeof toPostListView>[0]);

    expect(view.destinations[0]).not.toHaveProperty("accessTokenCiphertext");
    expect(JSON.stringify(view)).not.toContain("idempotencyKey");
    expect(JSON.stringify(view)).not.toContain("attempts");
    expect(view.destinations[0]?.publishJobs[0]?.receipt).toBeNull();
  });
});
