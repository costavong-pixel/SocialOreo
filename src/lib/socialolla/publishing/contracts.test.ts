import { describe, expect, it } from "vitest";
import { derivePublishIdempotencyKey, sanitizeProviderReceipt } from "./contracts";
import { publishRetryAt } from "./job-service";

describe("durable Post publish contracts", () => {
  it("derives one stable destination-scoped idempotency key", () => {
    const input = { workspaceId: "wsp_1", postId: "post_1", destinationId: "dst_1", variantId: "var_1" };
    expect(derivePublishIdempotencyKey(input)).toBe(derivePublishIdempotencyKey(input));
    expect(derivePublishIdempotencyKey(input)).not.toBe(derivePublishIdempotencyKey({ ...input, destinationId: "dst_2" }));
  });

  it("uses bounded exponential retry times and sanitizes receipts", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(publishRetryAt(now, 1).toISOString()).toBe("2026-08-23T00:01:00.000Z");
    expect(publishRetryAt(now, 3).toISOString()).toBe("2026-08-23T00:04:00.000Z");
    const receipt = sanitizeProviderReceipt({ provider: "instagram", externalId: "media_1", metadata: { token: "never-store-token", containerId: "container_1" } });
    expect(receipt.externalId).toBe("media_1");
    expect(receipt.metadata).toEqual({ containerId: "container_1" });
  });
});
