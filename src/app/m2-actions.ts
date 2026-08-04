"use server";

import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getSessionUser, getVerifiedSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { proposeProfile, confirmProfile, addSandboxDestination, createFirstPostAndPlan } from "@/lib/socialolla/onboarding/onboarding-actions";
import { createPostRequest, updatePostVariant, approveAndSchedulePost, listPostRequests } from "@/lib/socialolla/post/post-actions";
import { createWatchService } from "@/lib/socialolla/watch/watch-service";
import { runFreeDemo, type DemoResult } from "@/lib/socialolla/demo/demo-service";
import { assistantRespond } from "@/lib/socialolla/assistant/assistant-api";
import type { AssistantDomain } from "@/lib/socialolla/assistant/assistant";
import { normalizeLocale } from "@/lib/socialolla/i18n/locales";
import { adminAdjustCredits, adminInspectEntitlement, adminAuditEvents, adminSetLifetimePriceCents } from "@/lib/socialolla/admin/admin-actions";
import { selectSpendableBatch, ensureMonthlyBatch } from "@/lib/socialolla/credits/batch-service";

const LOCALE_COOKIE = "so_locale";
const DEMO_VISITOR_COOKIE = "so_demo_visitor";

async function requireUser() {
  const user = await getVerifiedSessionUser();
  if (!user) throw new Error("A verified account is required.");
  return user;
}

function signDemoVisitor(token: string): string {
  const secret = process.env.DEMO_VISITOR_SECRET ?? process.env.AUTH0_SECRET;
  if (!secret) throw new Error("Demo visitor signing requires DEMO_VISITOR_SECRET or AUTH0_SECRET.");
  return createHmac("sha256", secret).update(token).digest("base64url").slice(0, 22);
}

export type M2DemoResponse =
  | { status: "ok"; reRun: boolean; demo: DemoResult }
  | { status: "already-used"; signedIn: boolean };

export async function m2SetLocale(locale: string) {
  const cookieStore = await cookies();
  const normalized = normalizeLocale(locale);
  cookieStore.set(LOCALE_COOKIE, normalized, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
  return { locale: normalized };
}

export async function m2LocaleFromCookie(): Promise<string> {
  const cookieStore = await cookies();
  const stored = cookieStore.get(LOCALE_COOKIE)?.value;
  return stored ? normalizeLocale(stored) : "en-US";
}

export async function m2Workspace() {
  const user = await requireUser();
  return getOrCreatePersonalWorkspace(user.id);
}

export async function m2OnboardingPropose(purpose: string) {
  const user = await requireUser();
  return proposeProfile({ authUserId: user.id, purpose });
}

export async function m2OnboardingConfirm(input: Omit<Parameters<typeof confirmProfile>[0], "authUserId">) {
  const user = await requireUser();
  return confirmProfile({ ...input, authUserId: user.id });
}

export async function m2AddDestination(platform: string, accountLabel: string) {
  const user = await requireUser();
  return addSandboxDestination({ authUserId: user.id, platform, accountLabel });
}

export async function m2FirstPostAndPlan(input: { destinationExternalId: string; businessName?: string; topic?: string; language: string }) {
  const user = await requireUser();
  return createFirstPostAndPlan({ authUserId: user.id, ...input });
}

export async function m2CreatePost(input: { destinationExternalId: string; language: string; requestedCount: number; contentIntent?: string }) {
  const user = await requireUser();
  return createPostRequest({ authUserId: user.id, confirmed: true, ...input });
}

export async function m2UpdateVariant(input: { postRequestExternalId: string; title: string; caption?: string; hashtags?: string[]; cta?: string; isFinal?: boolean }) {
  const user = await requireUser();
  return updatePostVariant({ authUserId: user.id, ...input });
}

export async function m2SchedulePost(input: { postRequestExternalId: string; scheduleAt: string; timezone: string }) {
  const user = await requireUser();
  return approveAndSchedulePost({ authUserId: user.id, postRequestExternalId: input.postRequestExternalId, scheduleAt: new Date(input.scheduleAt), timezone: input.timezone, confirmed: true });
}

export async function m2ListPosts() {
  const user = await requireUser();
  return listPostRequests(user.id);
}

export async function m2WatchPreview() {
  const user = await requireUser();
  return createWatchService().preview(user.id);
}

export async function m2RunWatch(profileUrl: string, platform: "instagram" | "tiktok", confirmed = false) {
  const user = await requireUser();
  return createWatchService().run({ authUserId: user.id, profileUrl, platform, confirmed });
}

export async function m2WatchReports() {
  const user = await requireUser();
  return createWatchService().list(user.id);
}

export async function m2CreditsOverview() {
  const user = await requireUser();
  const workspace = await getOrCreatePersonalWorkspace(user.id);
  const entitlement = await import("@/lib/db/prisma").then((m) =>
    m.prisma.entitlementSnapshot.findFirst({ where: { workspace: { ownerUserId: user.id } }, orderBy: { validFrom: "desc" } }),
  );
  const batches = await import("@/lib/db/prisma").then((m) => m.prisma.creditBatch.findMany({ where: { workspaceId: workspace.dbId }, orderBy: { createdAt: "desc" } }));
  const transactions = await import("@/lib/db/prisma").then((m) =>
    m.prisma.creditTransaction.findMany({ where: { batch: { workspaceId: workspace.dbId } }, orderBy: { createdAt: "desc" }, take: 50 }),
  );
  const spendable = await selectSpendableBatch(workspace.dbId, 1);
  return {
    workspaceId: workspace.id,
    batches,
    transactions,
    spendableBatchExternalId: spendable?.externalId ?? null,
    entitlement: entitlement
      ? {
          includedMonthlyCredits: entitlement.includedMonthlyCredits,
          postCreditsPerRequest: entitlement.postCreditsPerRequest,
          watchCreditsPerRequest: entitlement.watchCreditsPerRequest,
          maxDestinations: entitlement.maxDestinations,
        }
      : null,
  };
}

export async function m2EnsureMonthlyBatch() {
  const user = await requireUser();
  const workspace = await getOrCreatePersonalWorkspace(user.id);
  const entitlement = await import("@/lib/db/prisma").then((m) =>
    m.prisma.entitlementSnapshot.findFirst({ where: { workspace: { ownerUserId: user.id } }, orderBy: { validFrom: "desc" } }),
  );
  return ensureMonthlyBatch({ internalWorkspaceId: workspace.dbId, externalWorkspaceId: workspace.id, includedCredits: entitlement?.includedMonthlyCredits ?? 0 });
}

export async function m2Demo(topic: string): Promise<M2DemoResponse> {
  // Guest demo: the visitor key comes from a signed server-set cookie, never a
  // client-supplied value, and never the hardcoded "anon-session". The demo
  // runs once per visitor; signed-in visitors get a limited re-run.
  const cookieStore = await cookies();
  const existing = cookieStore.get(DEMO_VISITOR_COOKIE)?.value;
  let visitorKey: string | null = null;
  if (existing) {
    const [token, sig] = existing.split(".");
    if (token && sig && signDemoVisitor(token) === sig) visitorKey = token;
  }

  const signedIn = (await getSessionUser()) !== null;

  if (!visitorKey) {
    const token = randomBytes(18).toString("base64url");
    const signed = `${token}.${signDemoVisitor(token)}`;
    cookieStore.set(DEMO_VISITOR_COOKIE, signed, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
    return { status: "ok", reRun: false, demo: runFreeDemo({ topic, visitorKey: token }) };
  }

  if (!signedIn) return { status: "already-used", signedIn: false };

  // Signed-in visitor: allow a limited re-run so they can try a new topic.
  return { status: "ok", reRun: true, demo: runFreeDemo({ topic, visitorKey }) };
}

export async function m2RequireAdmin() {
  const user = await getSessionUser();
  if (!user) return { admin: false };
  const ok = await requireAdminByAuthUserId(user.id);
  return { admin: ok };
}

export async function m2AssistantRespond(input: {
  intent: string;
  domain: AssistantDomain;
  providedToken?: string;
  expectedToken?: string;
  preview?: string;
}) {
  // authenticated is always derived from the verified session server-side;
  // a guest (not signed in / unverified) is never treated as authenticated.
  const verified = await getVerifiedSessionUser();
  return assistantRespond({ ...input, authenticated: verified !== null });
}

export async function m2AdminAdjust(targetUserId: string, amount: number, reason: string) {
  const admin = await requireUser();
  return adminAdjustCredits({ adminAuthUserId: admin.id, targetUserId, amount, reason });
}

export async function m2AdminInspect() {
  const admin = await requireUser();
  return adminInspectEntitlement(admin.id);
}

export async function m2AdminAudit() {
  const admin = await requireUser();
  return adminAuditEvents(admin.id);
}

export async function m2AdminSetLifetimePrice(priceCents: number) {
  const admin = await requireUser();
  return adminSetLifetimePriceCents(admin.id, priceCents);
}

export async function m2CalendarSlots() {
  const user = await requireUser();
  const workspace = await getOrCreatePersonalWorkspace(user.id);
  const prismaMod = await import("@/lib/db/prisma");
  return prismaMod.prisma.scheduleSlot.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { scheduleAt: "asc" },
    take: 200,
  });
}

export async function m2WorkspaceSettings() {
  const user = await requireUser();
  return getOrCreatePersonalWorkspace(user.id);
}
