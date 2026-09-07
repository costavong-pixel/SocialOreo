import { NextResponse } from "next/server";

import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import {
  CustomerIncidentIdentityError,
  customerIncidentRequestSchema,
  recordCustomerIncident,
} from "@/lib/observability/customer-incident";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const resolution = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(resolution)) {
    return NextResponse.json({ error: "Account identity conflict." }, { status: 409, headers: noStoreHeaders });
  }
  if (!resolution) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStoreHeaders });
  }

  const parsed = customerIncidentRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid incident report." }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const result = await recordCustomerIncident({
      dbUserId: resolution.dbId,
      authUserId: resolution.authUserId,
      clientEventId: parsed.data.clientEventId,
      route: parsed.data.route,
      digest: parsed.data.digest,
    });

    return NextResponse.json(
      { incidentReference: result.incidentReference },
      { status: result.status === "created" ? 201 : 200, headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof CustomerIncidentIdentityError) {
      return NextResponse.json({ error: "Account identity conflict." }, { status: 409, headers: noStoreHeaders });
    }
    return NextResponse.json(
      { error: "Incident reporting is temporarily unavailable." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
