import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { parsePurpose, identifyGaps, approveProfile, createFirstPost, createSevenDayPlan, selectProviderDisabledDestination, type ProfileField } from "./onboarding";

function newProfileExternalId(): string {
  return `prf_${randomBytes(12).toString("base64url")}`;
}

function newDestinationExternalId(): string {
  return `dst_${randomBytes(12).toString("base64url")}`;
}

/**
 * Slice B — workspace + conversational onboarding server actions.
 * Race-safe personal workspace; purpose intake; proposed profile with
 * accept/edit/reject/skip; sandbox-labelled destinations; first post +
 * seven-day plan with no automatic credit spend.
 */
export async function proposeProfile(input: { authUserId: string; purpose: string }) {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const draft = parsePurpose(input.purpose);
  const gaps = identifyGaps(draft);
  return { workspaceId: workspace.id, draft, gaps, needsApproval: true };
}

export async function confirmProfile(input: {
  authUserId: string;
  businessName: string;
  niche?: string;
  tone?: string;
  targetAudience?: string;
  primaryPlatform?: string;
  contentTopics?: string[];
  approvedFields: ProfileField[];
}) {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const rawDraft = parsePurpose(input.businessName);
  const draft = approveProfile(
    { ...rawDraft, businessName: input.businessName, niche: input.niche, tone: input.tone, targetAudience: input.targetAudience, primaryPlatform: input.primaryPlatform, contentTopics: input.contentTopics ?? [] },
    input.approvedFields,
  );
  const canonicalProfileExternalId = `prf_${Buffer.from(workspace.dbId).toString("base64url").slice(0, 22)}`;
  const profile = await prisma.profile.upsert({
    where: { externalId: canonicalProfileExternalId },
    update: {
      handle: draft.businessName ?? "personal",
      name: draft.businessName,
      platform: draft.primaryPlatform ?? "instagram",
      locale: "en-US",
      defaultLanguage: "en",
    },
    create: {
      externalId: canonicalProfileExternalId,
      workspaceId: workspace.dbId,
      handle: draft.businessName ?? "personal",
      name: draft.businessName,
      platform: draft.primaryPlatform ?? "instagram",
    },
  });
  return { profileExternalId: profile.externalId, profile: draft };
}

export async function addSandboxDestination(input: {
  authUserId: string;
  platform: string;
  accountLabel: string;
}) {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const destination = selectProviderDisabledDestination(input.platform, input.accountLabel);
  const row = await prisma.destination.create({
    data: {
      externalId: newDestinationExternalId(),
      workspaceId: workspace.dbId,
      label: input.accountLabel,
      platform: input.platform,
      accountLabel: input.accountLabel,
      status: "DISCONNECTED",
      providerDisabled: true,
    },
  });
  return { destinationExternalId: row.externalId, providerDisabled: destination.providerDisabled };
}

export async function createFirstPostAndPlan(input: {
  authUserId: string;
  destinationExternalId: string;
  businessName?: string;
  topic?: string;
  language: string;
}) {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const destination = await prisma.destination.findFirst({
    where: { externalId: input.destinationExternalId, workspaceId: workspace.dbId },
  });
  if (!destination) throw new Error("Destination not found");

  const firstPost = createFirstPost({
    destinationRef: input.destinationExternalId,
    language: input.language,
    businessName: input.businessName,
    topic: input.topic,
  });
  const plan = createSevenDayPlan({
    destinationRef: input.destinationExternalId,
    language: input.language,
    contentTopics: input.topic ? [input.topic] : [],
  });

  await prisma.sevenDayPlan.create({
    data: {
      workspaceId: workspace.dbId,
      destinationRef: input.destinationExternalId,
      planJson: plan as object,
    },
  });

  // The first post is a local LIGHT_DRAFT with NO credit hold and no CF call
  // (onboarding never spends credits automatically).
  const draftRequest = await prisma.postRequest.create({
    data: {
      externalId: `req_${randomBytes(12).toString("base64url")}`,
      workspaceId: workspace.dbId,
      destinationRef: input.destinationExternalId,
      language: input.language,
      status: "PENDING",
      intentKey: `so:${workspace.id}:${input.destinationExternalId}:first-post-draft`,
    },
  });
  await prisma.postOccurrence.create({
    data: {
      postRequestId: draftRequest.id,
      kind: "FIRST",
      status: "LIGHT_DRAFT",
      destinationRef: input.destinationExternalId,
    },
  });

  return {
    firstPost,
    plan,
    postStatus: "LIGHT_DRAFT",
    note: "First post is a light draft; ideas stay ideas; publishing and paid actions require separate confirmation.",
  };
}
