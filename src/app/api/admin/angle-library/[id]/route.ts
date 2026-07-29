import { AngleStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/angle-library/require-admin-api";
import { serializeAngle } from "@/lib/angle-library/serialize-angle";
import { angleLibraryUpdateSchema } from "@/lib/angle-library/types";
import { prisma } from "@/lib/db/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const statusUpdateSchema = z.object({
  status: z.nativeEnum(AngleStatus),
});

export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireAdminApi();

  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;

  const angle = await prisma.angleLibrary.findUnique({ where: { id } });

  if (!angle) {
    return NextResponse.json({ error: "Angle not found." }, { status: 404 });
  }

  return NextResponse.json({ angle: serializeAngle(angle) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireAdminApi();

  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await context.params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const statusOnly = statusUpdateSchema.safeParse(body);

  if (statusOnly.success) {
    const angle = await prisma.angleLibrary.update({
      where: { id },
      data: { status: statusOnly.data.status },
    });

    return NextResponse.json({ angle: serializeAngle(angle) });
  }

  const parsed = angleLibraryUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid angle payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  try {
    const angle = await prisma.angleLibrary.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ angle: serializeAngle(angle) });
  } catch {
    return NextResponse.json({ error: "Angle not found." }, { status: 404 });
  }
}
