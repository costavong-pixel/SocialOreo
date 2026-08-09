import { NextResponse } from "next/server";

import { syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getSquareConfig } from "@/lib/payments/square/config";
import { SquareCheckoutServiceError, startSquareCheckout } from "@/lib/payments/square/checkout-service";
import { requireSquareCheckoutAccess } from "@/lib/payments/square/tester-gate";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";

export async function POST() {
  const authUser = await requireSquareCheckoutAccess();
  if (!authUser) return NextResponse.json({ error: "Monthly checkout is restricted to authorized accounts." }, { status: 403 });

  const rateLimit = checkRateLimit(`square:monthly-checkout:${authUser.id}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const config = getSquareConfig();
  if (!config) return NextResponse.json({ error: "Monthly checkout is not configured yet." }, { status: 503 });

  try {
    const user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
    const checkout = await startSquareCheckout({ userId: user.id, productId: "monthly", config });
    return NextResponse.json(checkout);
  } catch (error) {
    // Never log request data or Square responses. Hosted checkout handles card
    // and contact data directly with Square.
    console.warn("Square Monthly hosted checkout request failed.", { reason: error instanceof SquareCheckoutServiceError ? "square_rejected" : "internal" });
    return NextResponse.json({ error: "We could not open the Monthly checkout." }, { status: 502 });
  }
}
