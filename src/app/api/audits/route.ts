import { NextResponse } from "next/server";

import { createAuditSchema } from "@/lib/audit/create-audit-schema";
import { createAndRunAudit } from "@/lib/audit/run-audit";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  const user = await getVerifiedSessionUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createAuditSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid audit request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await createAndRunAudit({
    authUserId: user.id,
    email: user.email,
    url: parsed.data.url,
    campaignBrief: parsed.data.campaignBrief,
    requestedTier: parsed.data.requestedTier,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.message,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      {
        status: result.status,
        headers: result.retryAfterSeconds
          ? { "Retry-After": String(result.retryAfterSeconds) }
          : undefined,
      },
    );
  }

  return NextResponse.json({ auditJobId: result.auditJobId, status: "COMPLETED" });
}
