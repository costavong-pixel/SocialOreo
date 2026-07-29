import { createHmac, timingSafeEqual } from "node:crypto";

export type SquareSignatureVerificationResult =
  | { ok: true }
  | { ok: false; reason: "missing_signature" | "invalid_signature" };

export function verifySquareWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  signatureKey: string,
  notificationUrl: string,
): SquareSignatureVerificationResult {
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };

  const expected = createHmac("sha256", signatureKey)
    .update(notificationUrl + rawBody)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true };
}
