import { createHash } from "node:crypto";

export const STAGING_POST_CREDIT_AMOUNT = 5;
export const STAGING_POST_CREDIT_REFERENCE = "staging:b2-post-credit-fixture";
export const STAGING_POST_CREDIT_REASON = "Staging-only B2 provider-disabled acceptance fixture";

export function stagingPostCreditIdempotencyKey(workspaceExternalId: string): string {
  const digest = createHash("sha256").update(workspaceExternalId).digest("hex").slice(0, 16);
  return `so:${workspaceExternalId}:staging-credit-fixture:post-acceptance:${digest}`;
}
