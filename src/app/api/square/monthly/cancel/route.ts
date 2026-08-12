import { NextResponse } from "next/server";

import { syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getSquareConfig } from "@/lib/payments/square/config";
import { getActiveMonthlySubscriptionForUser, recordSquareSubscription } from "@/lib/payments/square/checkout-service";
import { cancelMonthlySubscription, SquareSubscriptionError } from "@/lib/payments/square/subscription-api";
import { requireSquareCheckoutAccess } from "@/lib/payments/square/tester-gate";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";

export async function POST() {
  const authUser = await requireSquareCheckoutAccess();
  if (!authUser) return NextResponse.json({ error: "Monthly checkout is restricted to authorized accounts." }, { status: 403 });

  const rateLimit = checkRateLimit(`square:monthly-cancel:${authUser.id}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const config = getSquareConfig();
  if (!config) return NextResponse.json({ error: "Monthly checkout is not configured yet." }, { status: 503 });

  try {
    const user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
    const existing = await getActiveMonthlySubscriptionForUser(user.id, config.monthlyPlanVariationId);
    if (!existing) return NextResponse.json({ error: "No active Monthly subscription was found." }, { status: 404 });

    const subscription = await cancelMonthlySubscription({ subscriptionId: existing.subscriptionId, config });
    await recordSquareSubscription({
      subscriptionId: existing.subscriptionId,
      customerId: existing.customerId,
      planVariationId: existing.planVariationId,
      status: subscription.status,
      canceledDate: subscription.canceledDate,
      source: "API",
      eventType: "subscription.cancel_requested",
    });
    return NextResponse.json({ status: subscription.status, canceledDate: subscription.canceledDate });
  } catch (error) {
    console.warn("Square Monthly cancellation request failed.", { reason: error instanceof SquareSubscriptionError ? "square_rejected" : "internal" });
    return NextResponse.json({ error: "We could not schedule the cancellation." }, { status: 502 });
  }
}
