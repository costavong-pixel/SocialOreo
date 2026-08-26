import { NextResponse } from "next/server";
import { getReleaseIdentity } from "@/lib/runtime/release-identity";

export function GET() {
  const release = getReleaseIdentity();

  return NextResponse.json({
    ok: true,
    service: "socialolla",
    phase: "phase-1-foundation",
    environment: release.environment,
    revision: release.revision,
    buildTimestamp: release.buildTimestamp,
  });
}
