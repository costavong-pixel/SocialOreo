import type { SquareConfig } from "./config";
import { squareApiBaseUrl, squareApiVersion } from "./square-api";

type SquareSubscription = { status?: string; canceled_date?: string | null };

const CANCELLATION_RESPONSE_STATUSES = new Set(["ACTIVE", "CANCELED", "DEACTIVATED", "PAUSED", "COMPLETED"]);

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export class SquareSubscriptionError extends Error {
  constructor(message = "Square could not update the Monthly subscription.") {
    super(message);
    this.name = "SquareSubscriptionError";
  }
}

export async function cancelMonthlySubscription(input: { subscriptionId: string; config: SquareConfig }): Promise<{ status: string; canceledDate: string | null }> {
  // Square API 2026-07-15 schedules cancellation at the end of the active
  // billing cycle using a body-less POST. Do not send a JSON body or invent an
  // admin/immediate-cancel override; Square owns the billing cadence.
  const response = await fetch(`${squareApiBaseUrl(input.config.environment)}/v2/subscriptions/${encodeURIComponent(input.subscriptionId)}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": squareApiVersion(),
    },
  });
  const payload = (await response.json().catch(() => null)) as { subscription?: SquareSubscription } | null;
  const subscription = payload?.subscription;
  const canceledDate = subscription?.canceled_date ?? null;
  if (
    !response.ok ||
    !subscription?.status ||
    !CANCELLATION_RESPONSE_STATUSES.has(subscription.status) ||
    (canceledDate !== null && !isDateOnly(canceledDate)) ||
    (subscription.status === "ACTIVE" && canceledDate === null)
  ) throw new SquareSubscriptionError();
  return { status: subscription.status, canceledDate };
}
