import { AngleStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/angle-library/require-admin-api";
import { serializeAngle } from "@/lib/angle-library/serialize-angle";
import { angleLibraryInputSchema } from "@/lib/angle-library/types";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const authResult = await requireAdminApi();

  if (!authResult.ok) {
    return authResult.response;
  }

  const angles = await prisma.angleLibrary.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({
    angles: angles.map(serializeAngle),
  });
}

export async function POST(request: Request) {
  const authResult = await requireAdminApi();

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = angleLibraryInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid angle payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const angle = await prisma.angleLibrary.create({
    data: {
      ...parsed.data,
      status: parsed.data.status ?? AngleStatus.DRAFT,
      internalOnly: parsed.data.internalOnly ?? true,
    },
  });

  return NextResponse.json({ angle: serializeAngle(angle) }, { status: 201 });
}
