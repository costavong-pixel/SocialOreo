import { NextResponse } from "next/server";

import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { campaignBriefSuggestionInputSchema, suggestCampaignBrief } from "@/lib/campaign-brief/suggestions";
import { checkRateLimit } from "@/lib/rate-limit/rate-limit";

export async function POST(request: Request) {
  const user = await getVerifiedSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const limit = checkRateLimit(`campaign-brief-suggestion:${user.id}`, { maxRequests: 6, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Please wait before requesting another suggestion." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }

  const parsed = campaignBriefSuggestionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an occasion, goal, niche, and tone first." }, { status: 400 });

  try {
    return NextResponse.json(await suggestCampaignBrief(parsed.data));
  } catch {
    return NextResponse.json({ error: "We could not make a suggestion right now. Please try again." }, { status: 502 });
  }
}
