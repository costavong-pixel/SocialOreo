import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "reelana",
    phase: "phase-1-foundation",
  });
}
