import { NextResponse } from "next/server";

import { syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getSquareConfig } from "@/lib/payments/square/config";
import { getActiveMonthlySubscriptionForUser, recordSquareSubscription } from "@/lib/payments/square/checkout-service";
import { cancelMonthlySubscription, SquareSubscriptionError } from "@/lib/payments/square/subscription-api";
import { requireSquareSandboxTester } from "@/lib/payments/square/tester-gate";

export async function POST() {
  const authUser = await requireSquareSandboxTester();
  if (!authUser) return NextResponse.json({ error: "Monthly Sandbox checkout is restricted to the owner test account." }, { status: 403 });

  const config = getSquareConfig();
  if (!config) return NextResponse.json({ error: "Sandbox Monthly checkout is not configured yet." }, { status: 503 });

  try {
    const user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
    const existing = await getActiveMonthlySubscriptionForUser(user.id);
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
    return NextResponse.json({ error: "We could not schedule the Sandbox cancellation." }, { status: 502 });
  }
}
