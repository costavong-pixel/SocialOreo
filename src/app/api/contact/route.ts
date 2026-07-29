import { NextResponse } from "next/server";

import { contactRequestSchema } from "@/lib/contact/contact-schema";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";

function contactRateLimitKey(request: Request): string {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `contact:${ip || "unknown"}`;
}

export async function POST(request: Request) {
  const limit = checkRateLimit(contactRateLimitKey(request), { maxRequests: 3, windowMs: 60 * 60 * 1_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Please wait before sending another message." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = contactRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide your name, a valid email, and a message of at least 10 characters." }, { status: 400 });
  }

  await prisma.contactRequest.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      message: parsed.data.message,
    },
  });

  return NextResponse.json({ ok: true });
}
