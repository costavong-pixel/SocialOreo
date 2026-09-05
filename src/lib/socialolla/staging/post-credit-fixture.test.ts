import { describe, expect, it } from "vitest";
import {
  STAGING_POST_CREDIT_AMOUNT,
  STAGING_POST_CREDIT_REASON,
  STAGING_POST_CREDIT_REFERENCE,
  stagingPostCreditIdempotencyKey,
} from "@/lib/socialolla/staging/post-credit-fixture";

describe("staging Post credit fixture", () => {
  it("uses a stable, namespaced idempotency key and explicit QA metadata", () => {
    const first = stagingPostCreditIdempotencyKey("wsp_staging_workspace");
    expect(first).toBe(stagingPostCreditIdempotencyKey("wsp_staging_workspace"));
    expect(first).toMatch(/^so:wsp_staging_workspace:staging-credit-fixture:post-acceptance:[a-f0-9]{16}$/);
    expect(first).not.toBe(stagingPostCreditIdempotencyKey("wsp_other_workspace"));
    expect(STAGING_POST_CREDIT_AMOUNT).toBe(5);
    expect(STAGING_POST_CREDIT_REFERENCE).toBe("staging:b2-post-credit-fixture");
    expect(STAGING_POST_CREDIT_REASON).toMatch(/staging-only/i);
  });
});
