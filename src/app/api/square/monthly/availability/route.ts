import { NextResponse } from "next/server";

import { getSquareConfig } from "@/lib/payments/square/config";
import { requireSquareCheckoutAccess } from "@/lib/payments/square/tester-gate";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";

// This endpoint intentionally returns no Square configuration. It only lets the
// client decide whether to render the Monthly checkout entry point.
export async function GET() {
  const authUser = await requireSquareCheckoutAccess();
  if (!authUser) return NextResponse.json({ error: "Monthly checkout is restricted to authorized accounts." }, { status: 403 });

  const rateLimit = checkRateLimit(`square:monthly-availability:${authUser.id}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  if (!getSquareConfig()) return NextResponse.json({ error: "Monthly checkout is not configured yet." }, { status: 503 });
  return NextResponse.json({ available: true });
}
