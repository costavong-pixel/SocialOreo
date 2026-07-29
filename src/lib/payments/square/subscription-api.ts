import type { SquareConfig } from "./config";

const SQUARE_SANDBOX_API = "https://connect.squareupsandbox.com";
const SQUARE_API_VERSION = "2026-07-15";

type SquareSubscription = { status?: string; canceled_date?: string | null };

export class SquareSubscriptionError extends Error {
  constructor(message = "Square could not update the Monthly subscription.") {
    super(message);
    this.name = "SquareSubscriptionError";
  }
}

export async function cancelMonthlySubscription(input: { subscriptionId: string; config: SquareConfig }): Promise<{ status: string; canceledDate: string | null }> {
  const response = await fetch(`${SQUARE_SANDBOX_API}/v2/subscriptions/${encodeURIComponent(input.subscriptionId)}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION,
    },
  });
  const payload = (await response.json().catch(() => null)) as { subscription?: SquareSubscription } | null;
  const subscription = payload?.subscription;
  if (!response.ok || !subscription?.status) throw new SquareSubscriptionError();
  return { status: subscription.status, canceledDate: subscription.canceled_date ?? null };
}
