import { describe, expect, it } from "vitest";

import { validateCompletedPaymentMoney } from "./payment-money";

describe("completed Square payment money contract", () => {
  const expected = { expectedAmountCents: 4900, expectedCurrency: "CAD" };

  it("accepts the exact completed payment", () => {
    expect(validateCompletedPaymentMoney({ paymentStatus: "COMPLETED", amountCents: 4900, currency: "CAD", ...expected })).toBeNull();
  });

  it("enforces the production Monthly contract exactly", () => {
    expect(validateCompletedPaymentMoney({ paymentStatus: "COMPLETED", amountCents: 4900, currency: "CAD", expectedAmountCents: 4900, expectedCurrency: "CAD" })).toBeNull();
    expect(validateCompletedPaymentMoney({ paymentStatus: "COMPLETED", amountCents: 4900, currency: "USD", expectedAmountCents: 4900, expectedCurrency: "CAD" })).toBe("currency_mismatch");
    expect(validateCompletedPaymentMoney({ paymentStatus: "COMPLETED", amountCents: 1900, currency: "CAD", expectedAmountCents: 4900, expectedCurrency: "CAD" })).toBe("amount_mismatch");
  });

  it.each([
    ["missing amount", { paymentStatus: "COMPLETED", currency: "CAD" }, "amount_missing_or_malformed"],
    ["missing currency", { paymentStatus: "COMPLETED", amountCents: 4900 }, "currency_missing_or_malformed"],
    ["lower amount", { paymentStatus: "COMPLETED", amountCents: 1900, currency: "CAD" }, "amount_mismatch"],
    ["higher amount", { paymentStatus: "COMPLETED", amountCents: 9900, currency: "CAD" }, "amount_mismatch"],
    ["wrong currency", { paymentStatus: "COMPLETED", amountCents: 4900, currency: "USD" }, "currency_mismatch"],
    ["malformed amount", { paymentStatus: "COMPLETED", amountCents: 49.5, currency: "CAD" }, "amount_missing_or_malformed"],
    ["zero amount", { paymentStatus: "COMPLETED", amountCents: 0, currency: "CAD" }, "amount_missing_or_malformed"],
    ["negative amount", { paymentStatus: "COMPLETED", amountCents: -4900, currency: "CAD" }, "amount_missing_or_malformed"],
    ["malformed currency", { paymentStatus: "COMPLETED", amountCents: 4900, currency: "CA" }, "currency_missing_or_malformed"],
    ["not completed", { paymentStatus: "PENDING", amountCents: 4900, currency: "CAD" }, "not_completed"],
    ["conflicting Square money fields", { paymentStatus: "COMPLETED", amountCents: 4900, currency: "CAD", moneyFieldsConsistent: false }, "money_fields_conflict"],
  ] as const)("rejects %s", (_label, actual, failure) => {
    expect(validateCompletedPaymentMoney({ ...actual, ...expected })).toBe(failure);
  });

  it("rejects a malformed expected contract rather than widening acceptance", () => {
    expect(validateCompletedPaymentMoney({ paymentStatus: "COMPLETED", amountCents: 4900, currency: "CAD", expectedAmountCents: 0, expectedCurrency: "CAD" })).toBe("expected_contract_invalid");
  });
});
