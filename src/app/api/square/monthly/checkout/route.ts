import { NextResponse } from "next/server";

import { syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getSquareConfig } from "@/lib/payments/square/config";
import { SquareCheckoutServiceError, startSquareCheckout } from "@/lib/payments/square/checkout-service";
import { requireSquareSandboxTester } from "@/lib/payments/square/tester-gate";

export async function POST() {
  const authUser = await requireSquareSandboxTester();
  if (!authUser) return NextResponse.json({ error: "Monthly Sandbox checkout is restricted to the owner test account." }, { status: 403 });

  const config = getSquareConfig();
  if (!config) return NextResponse.json({ error: "Sandbox Monthly checkout is not configured yet." }, { status: 503 });

  try {
    const user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
    const checkout = await startSquareCheckout({ userId: user.id, productId: "monthly", config });
    return NextResponse.json(checkout);
  } catch (error) {
    // Never log request data or Square responses. Hosted checkout handles card
    // and contact data directly with Square.
    console.warn("Square Monthly hosted checkout request failed.", { reason: error instanceof SquareCheckoutServiceError ? "square_rejected" : "internal" });
    return NextResponse.json({ error: "We could not open the Sandbox Monthly checkout." }, { status: 502 });
  }
}
