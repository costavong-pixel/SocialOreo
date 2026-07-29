import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/current-user";
import { campaignBriefSchema } from "@/lib/campaign-brief/types";
import { suggestComparisonHookIdeas } from "@/lib/reports/comparison-hook-ideas";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

const openingLine = (caption: string | null) => caption?.replace(/\s+/g, " ").split(/(?<=[.!?])\s|\n/)[0]?.trim().slice(0, 160);

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  const { id } = await context.params;
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const competitorId = (await request.json().catch(() => null) as { competitorId?: unknown } | null)?.competitorId;
  if (typeof competitorId !== "string" || !competitorId) return NextResponse.json({ error: "Choose a competitor report first." }, { status: 400 });

  const limit = checkRateLimit(`comparison-hook-ideas:${user.id}`, { maxRequests: 3, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Please wait before generating more examples." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const audits = await prisma.auditJob.findMany({
    where: { user: { authUserId: user.id }, status: "COMPLETED", auditReport: { isNot: null } },
    include: { socialProfiles: true, socialVideos: true },
  });
  const current = audits.find((audit) => audit.id === id);
  const competitor = audits.find((audit) => audit.id === competitorId && audit.id !== id);
  const brief = current ? campaignBriefSchema.safeParse(current.campaignBriefJson).data : undefined;
  const openings = competitor ? [...competitor.socialVideos]
    .sort((left, right) => (right.viewCount ?? 0) - (left.viewCount ?? 0))
    .map((video) => openingLine(video.caption))
    .filter((opening): opening is string => Boolean(opening && opening.length >= 2))
    .slice(0, 3) : [];

  if (!current || !competitor || !brief || !openings.length) return NextResponse.json({ error: "This comparison does not have enough saved data for tailored examples." }, { status: 404 });

  try {
    const ideas = await suggestComparisonHookIdeas({
      targetAudience: brief.targetAudience,
      offerOrCta: brief.offerOrCta,
      goal: brief.goal,
      tone: brief.tone,
      competitorLabel: competitor.socialProfiles[0]?.username ? `@${competitor.socialProfiles[0].username}` : competitor.profileUrl,
      observedOpenings: openings,
    });
    return NextResponse.json(ideas);
  } catch {
    return NextResponse.json({ error: "We could not generate examples right now. Please try again." }, { status: 502 });
  }
}
