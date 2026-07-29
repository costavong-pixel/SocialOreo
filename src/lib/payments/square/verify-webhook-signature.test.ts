import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifySquareWebhookSignature } from "./verify-webhook-signature";

const signatureKey = "test-webhook-signature-key";
const notificationUrl = "https://example.test/api/square/webhook";
const body = JSON.stringify({ type: "payment.updated" });

function sign(rawBody: string) {
  return createHmac("sha256", signatureKey).update(notificationUrl + rawBody).digest("base64");
}

describe("verifySquareWebhookSignature", () => {
  it("rejects a missing signature", () => {
    expect(verifySquareWebhookSignature(body, null, signatureKey, notificationUrl)).toEqual({ ok: false, reason: "missing_signature" });
  });

  it("rejects an invalid signature", () => {
    expect(verifySquareWebhookSignature(body, "wrong", signatureKey, notificationUrl)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("accepts the Square HMAC over the configured URL and raw body", () => {
    expect(verifySquareWebhookSignature(body, sign(body), signatureKey, notificationUrl)).toEqual({ ok: true });
  });
});
