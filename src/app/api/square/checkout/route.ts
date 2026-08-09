import { NextResponse } from "next/server";
import { z } from "zod";

import { syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getSquareConfig } from "@/lib/payments/square/config";
import { startSquareCheckout } from "@/lib/payments/square/checkout-service";
import { oneTimeSquareProductIds } from "@/lib/payments/square/products";
import { requireSquareCheckoutAccess } from "@/lib/payments/square/tester-gate";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";

// Monthly is intentionally absent: it uses the app-owned Web Payments SDK flow.
const checkoutSchema = z.object({ product: z.enum(oneTimeSquareProductIds) });

export async function POST(request: Request) {
  // Environment-aware gate: sandbox keeps the allowlist + admin gate; production
  // requires a verified session user. Environment source is squareEnv().
  const authUser = await requireSquareCheckoutAccess();
  if (!authUser) {
    return NextResponse.json({ error: "Checkout is restricted to authorized accounts." }, { status: 403 });
  }

  // Per-user rate limit after the authorization gate and before any user sync,
  // Square call or DB work. Never replaces a sandbox authorization 403.
  const rateLimit = checkRateLimit(`square:checkout:${authUser.id}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const config = getSquareConfig();
  if (!config) {
    return NextResponse.json({ error: "Checkout is not configured yet." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid purchase option." }, { status: 400 });
  }

  try {
    const user = await syncUserFromAuth0({ id: authUser.id, email: authUser.email });
    const checkout = await startSquareCheckout({
      userId: user.id,
      productId: parsed.data.product,
      config,
    });
    return NextResponse.json(checkout);
  } catch (error) {
    console.error("Square checkout request failed.", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "We could not open checkout." }, { status: 502 });
  }
}
