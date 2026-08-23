import { NextResponse } from "next/server";
import { z } from "zod";

import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db/prisma";

const feedbackSchema = z.object({
  rating: z.enum(["HELPFUL", "NOT_YET"]),
  usefulSections: z.array(z.enum([
    "Public performance",
    "Action plan",
    "Score breakdown",
    "What is working",
    "What is hurting",
    "Reel structures",
    "Content pack",
  ])).max(7),
  comments: z.string().trim().max(2000).optional().nullable(),
}).strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

function serialize(feedback: {
  rating: "HELPFUL" | "NOT_YET";
  usefulSections: string[];
  comments: string | null;
  updatedAt: Date;
}) {
  return {
    rating: feedback.rating,
    usefulSections: feedback.usefulSections,
    comments: feedback.comments,
    updatedAt: feedback.updatedAt,
  };
}

async function ownedAuditId(id: string, dbUserId: string) {
  const audit = await prisma.auditJob.findFirst({
    where: {
      id,
      userId: dbUserId,
    },
    select: {
      id: true,
      status: true,
      auditReport: { select: { id: true } },
    },
  });

  return audit?.status === "COMPLETED" && audit.auditReport ? audit.id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const resolution = await resolveDbUserFromVerifiedSession();

  if (hasDbSessionIdentityConflict(resolution)) {
    return NextResponse.json({ error: "Account identity conflict." }, { status: 409 });
  }
  if (!resolution) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const auditId = await ownedAuditId(id, resolution.dbId);

  if (!auditId) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  const feedback = await prisma.auditFeedback.findUnique({
    where: { auditJobId: auditId },
  });

  return NextResponse.json({ feedback: feedback ? serialize(feedback) : null });
}

export async function PUT(request: Request, context: RouteContext) {
  const resolution = await resolveDbUserFromVerifiedSession();

  if (hasDbSessionIdentityConflict(resolution)) {
    return NextResponse.json({ error: "Account identity conflict." }, { status: 409 });
  }
  if (!resolution) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid feedback.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const auditId = await ownedAuditId(id, resolution.dbId);

  if (!auditId) {
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  }

  const comments = parsed.data.comments?.trim() || null;
  const feedback = await prisma.auditFeedback.upsert({
    where: { auditJobId: auditId },
    create: {
      auditJobId: auditId,
      rating: parsed.data.rating,
      usefulSections: parsed.data.usefulSections,
      comments,
    },
    update: {
      rating: parsed.data.rating,
      usefulSections: parsed.data.usefulSections,
      comments,
    },
  });

  return NextResponse.json({ feedback: serialize(feedback) });
}
