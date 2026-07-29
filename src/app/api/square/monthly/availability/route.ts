import { NextResponse } from "next/server";

import { getSquareConfig } from "@/lib/payments/square/config";
import { requireSquareSandboxTester } from "@/lib/payments/square/tester-gate";

// This endpoint intentionally returns no Square configuration. It only lets the
// client decide whether to render the owner-only Sandbox entry point.
export async function GET() {
  const tester = await requireSquareSandboxTester();
  if (!tester) return NextResponse.json({ error: "Monthly Sandbox checkout is restricted to the owner test account." }, { status: 403 });
  if (!getSquareConfig()) return NextResponse.json({ error: "Sandbox Monthly checkout is not configured yet." }, { status: 503 });
  return NextResponse.json({ available: true });
}
