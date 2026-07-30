import { describe, expect, it, vi } from "vitest";
import { verifySquareMerchantContext } from "./merchant-context";

const config = { locationId: "location", expectedMerchantId: "merchant", accessToken: "secret" } as never;

describe("Square merchant context", () => {
  it("accepts only the configured location and merchant identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ location: { id: "location", merchant_id: "merchant" } }), { status: 200 })));
    await expect(verifySquareMerchantContext(config)).resolves.toBe(true);
  });

  it("fails closed for a mismatched merchant or failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ location: { id: "location", merchant_id: "other" } }), { status: 200 })));
    await expect(verifySquareMerchantContext(config)).resolves.toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(verifySquareMerchantContext(config)).resolves.toBe(false);
  });
});
