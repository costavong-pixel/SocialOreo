export type CompletedPaymentMoneyInput = {
  paymentStatus: string;
  amountCents?: number | null;
  currency?: string | null;
  moneyFieldsConsistent?: boolean;
  expectedAmountCents: number;
  expectedCurrency: string;
};

export type CompletedPaymentMoneyFailure =
  | "not_completed"
  | "money_fields_conflict"
  | "expected_contract_invalid"
  | "amount_missing_or_malformed"
  | "currency_missing_or_malformed"
  | "amount_mismatch"
  | "currency_mismatch";

export function validateCompletedPaymentMoney(input: CompletedPaymentMoneyInput): CompletedPaymentMoneyFailure | null {
  if (input.paymentStatus !== "COMPLETED") return "not_completed";
  if (input.moneyFieldsConsistent === false) return "money_fields_conflict";
  if (!Number.isSafeInteger(input.expectedAmountCents) || input.expectedAmountCents <= 0 || !/^[A-Z]{3}$/.test(input.expectedCurrency)) {
    return "expected_contract_invalid";
  }
  const amountCents = input.amountCents;
  if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0) return "amount_missing_or_malformed";
  if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) return "currency_missing_or_malformed";
  if (amountCents !== input.expectedAmountCents) return "amount_mismatch";
  if (input.currency !== input.expectedCurrency) return "currency_mismatch";
  return null;
}
