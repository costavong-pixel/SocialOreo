import { describe, expect, it } from "vitest";

import { checkCreditBalance } from "./credit-guard";

describe("checkCreditBalance", () => {
  it("allows free audits when no credits are required", () => {
    const result = checkCreditBalance(0, 0);

    expect(result).toEqual({ allowed: true, balance: 0 });
  });

  it("allows paid audits when balance is sufficient", () => {
    const result = checkCreditBalance(3, 1);

    expect(result).toEqual({ allowed: true, balance: 3 });
  });

  it("blocks paid audits when balance is insufficient", () => {
    const result = checkCreditBalance(0, 1);

    expect(result).toEqual({
      allowed: false,
      reason: "insufficient_credits",
      balance: 0,
      requiredCredits: 1,
    });
  });
});
