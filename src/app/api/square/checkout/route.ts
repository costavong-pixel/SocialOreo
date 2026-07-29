import { NextResponse } from "next/server";
import { z } from "zod";

import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { syncUserFromAuth0 } from "@/lib/auth/sync-user";
import { getSquareConfig } from "@/lib/payments/square/config";
import { startSquareCheckout } from "@/lib/payments/square/checkout-service";
import { oneTimeSquareProductIds } from "@/lib/payments/square/products";

// Monthly is intentionally absent: it uses the app-owned Web Payments SDK flow.
const checkoutSchema = z.object({ product: z.enum(oneTimeSquareProductIds) });

export async function POST(request: Request) {
  const authUser = await getVerifiedSessionUser();
  if (!authUser) {
    return NextResponse.json({ error: "A verified primary email address is required." }, { status: 403 });
  }

  const config = getSquareConfig();
  if (!config) {
    return NextResponse.json({ error: "Sandbox checkout is not configured yet." }, { status: 503 });
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
