import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";

export type AdminApiAuthResult =
  | {
      ok: true;
      authUserId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireAdminApi(): Promise<AdminApiAuthResult> {
  const user = await getSessionUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const isAdmin = await requireAdminByAuthUserId(user.id);

  if (!isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }

  return { ok: true, authUserId: user.id };
}
