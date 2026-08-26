import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { createPostService } from "@/lib/socialolla/content-factory/post-service";
import { intentKey } from "@/lib/socialolla/credits/batch-service";
import { enqueuePublishJob, reschedulePublishJob, cancelPublishJob } from "@/lib/socialolla/publishing/job-service";
import { processDuePublishJobs } from "@/lib/socialolla/publishing/publish-worker";
import { deleteOwnedMedia } from "@/lib/socialolla/media/media-service";

function externalId(prefix: string): string { return `${prefix}_${randomBytes(12).toString("base64url")}`; }

async function ownedWorkspace(authUserId: string) { return getOrCreatePersonalWorkspace(authUserId); }

async function assertOwnedMedia(workspaceId: string, mediaAssetIds: string[]) {
  const normalized = [...new Set(mediaAssetIds.map((id) => id.trim()).filter(Boolean))];
  if (normalized.length === 0) return [];
  const assets = await prisma.mediaAsset.findMany({ where: { workspaceId, externalId: { in: normalized }, status: "READY" } });
  if (assets.length !== normalized.length) throw new Error("One or more media assets are not owned by this workspace");
  return assets;
}

function result(postRequest: { externalId: string; cfRequestRef: string | null; status: string }) { return { postRequestId: postRequest.externalId, cfRequestId: postRequest.cfRequestRef, status: postRequest.status }; }

export async function createPostRequest(input: { authUserId: string; destinationExternalId: string; profileExternalId?: string; language: string; requestedCount: number; contentIntent?: string; confirmed: boolean; mediaAssetIds?: string[] }) {
  const workspace = await ownedWorkspace(input.authUserId);
  const destination = await prisma.destination.findFirst({ where: { externalId: input.destinationExternalId, workspaceId: workspace.dbId }, select: { id: true, externalId: true, platform: true } });
  if (!destination) throw new Error("Destination not found for this workspace");
  const mediaAssetIds = [...new Set(input.mediaAssetIds ?? [])];
  await assertOwnedMedia(workspace.dbId, mediaAssetIds);
  const intent = intentKey(workspace.id, input.destinationExternalId, input.contentIntent?.trim() || "post");
  const replay = await prisma.postRequest.findUnique({ where: { intentKey: intent }, select: { externalId: true, cfRequestRef: true, status: true } });
  if (replay) return result(replay);
  const service = createPostService();
  const preview = await service.preview(input.authUserId, input.destinationExternalId, input.requestedCount);
  if (!preview.batchAvailable) throw new Error("Insufficient credits");
  const request = await service.execute({ authUserId: input.authUserId, destinationExternalId: input.destinationExternalId, profileExternalId: input.profileExternalId, language: input.language, requestedCount: input.requestedCount, confirmed: input.confirmed, contentIntent: input.contentIntent });
  const postRequest = await prisma.$transaction(async (tx) => {
    const existing = await tx.postRequest.findUnique({ where: { intentKey: intent }, select: { externalId: true, cfRequestRef: true, status: true } });
    if (existing) return existing;
    const created = await tx.postRequest.create({ data: { externalId: externalId("post"), workspaceId: workspace.dbId, destinationRef: input.destinationExternalId, profileRef: input.profileExternalId, language: input.language, requestedCount: input.requestedCount, status: "REVIEW", intentKey: intent, cfRequestRef: request.id } });
    const variant = await tx.postVariant.create({ data: { postRequestId: created.id, platform: destination.platform, title: `Draft title (${input.language})`, caption: `Draft caption for ${destination.platform} in ${input.language}.`, hashtags: [], cta: "Learn more", variantLocale: `${input.language}-US`, mediaAssetIds } });
    await tx.postOccurrence.create({ data: { postRequestId: created.id, kind: "FIRST", status: "LIGHT_DRAFT", destinationRef: input.destinationExternalId } });
    await tx.postDestination.create({ data: { externalId: externalId("postdst"), postRequestId: created.id, destinationId: destination.id, variantId: variant.id, platform: destination.platform, status: "PENDING" } });
    return created;
  });
  return result(postRequest);
}

export async function updatePostVariant(input: { authUserId: string; postRequestExternalId: string; title: string; caption?: string; hashtags?: string[]; cta?: string; isFinal?: boolean; mediaAssetIds?: string[] }) {
  const workspace = await ownedWorkspace(input.authUserId);
  const postRequest = await prisma.postRequest.findFirst({ where: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId } });
  if (!postRequest) throw new Error("Post request not found");
  const variant = await prisma.postVariant.findFirst({ where: { postRequestId: postRequest.id } });
  if (!variant) throw new Error("Variant not found");
  const mediaAssetIds = input.mediaAssetIds ?? variant.mediaAssetIds;
  await assertOwnedMedia(workspace.dbId, mediaAssetIds);
  await prisma.postVariant.update({ where: { id: variant.id }, data: { title: input.title.trim(), caption: input.caption, hashtags: input.hashtags ?? [], cta: input.cta, isFinal: input.isFinal ?? false, mediaAssetIds } });
  return { updated: true };
}

export async function replacePostMedia(input: { authUserId: string; postRequestExternalId: string; oldAssetId: string; newAssetId: string }) {
  const workspace = await ownedWorkspace(input.authUserId);
  const postRequest = await prisma.postRequest.findFirst({ where: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId } });
  if (!postRequest) throw new Error("Post request not found");
  const variant = await prisma.postVariant.findFirst({ where: { postRequestId: postRequest.id, mediaAssetIds: { has: input.oldAssetId } } });
  if (!variant) throw new Error("The original media is not attached to this Post");
  await assertOwnedMedia(workspace.dbId, [input.newAssetId]);
  const nextMedia = variant.mediaAssetIds.map((assetId) => assetId === input.oldAssetId ? input.newAssetId : assetId);
  await prisma.postVariant.update({ where: { id: variant.id }, data: { mediaAssetIds: nextMedia } });
  await deleteOwnedMedia({ authUserId: input.authUserId, assetId: input.oldAssetId });
  return { replaced: true, mediaAssetIds: nextMedia };
}

export async function approveAndSchedulePost(input: { authUserId: string; postRequestExternalId: string; scheduleAt: Date; timezone: string; confirmed: boolean }) {
  if (!input.confirmed) throw new Error("Protected action requires exact confirmation");
  const workspace = await ownedWorkspace(input.authUserId);
  const postRequest = await prisma.postRequest.findFirst({ where: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId }, include: { destinations: true } });
  if (!postRequest) throw new Error("Post request not found");
  const variant = await prisma.postVariant.findFirst({ where: { postRequestId: postRequest.id, isFinal: true } });
  if (!variant) throw new Error("No approved final variant");
  if (Number.isNaN(input.scheduleAt.getTime()) || input.scheduleAt.getTime() <= Date.now()) throw new Error("Scheduled publish time must be in the future");
  await prisma.$transaction(async (tx) => {
    await tx.postRequest.update({ where: { id: postRequest.id }, data: { status: "SCHEDULED" } });
    await tx.postOccurrence.updateMany({ where: { postRequestId: postRequest.id, kind: "FIRST" }, data: { status: "SCHEDULED", scheduleAt: input.scheduleAt, timezone: input.timezone } });
    const existing = await tx.scheduleSlot.findFirst({ where: { workspaceId: workspace.dbId, postRequestId: postRequest.id, destinationRef: postRequest.destinationRef } });
    if (existing) await tx.scheduleSlot.update({ where: { id: existing.id }, data: { scheduleAt: input.scheduleAt, timezone: input.timezone } });
    else await tx.scheduleSlot.create({ data: { workspaceId: workspace.dbId, postRequestId: postRequest.id, destinationRef: postRequest.destinationRef, scheduleAt: input.scheduleAt, timezone: input.timezone } });
  });
  for (const target of postRequest.destinations) await enqueuePublishJob({ authUserId: input.authUserId, postRequestExternalId: postRequest.externalId, postDestinationExternalId: target.externalId, mode: "SCHEDULED", scheduledFor: input.scheduleAt, timezone: input.timezone });
  return { status: "SCHEDULED" as const };
}

export async function publishPostNow(input: { authUserId: string; postRequestExternalId: string; confirmed: boolean }) {
  if (!input.confirmed) throw new Error("Protected action requires exact confirmation");
  const workspace = await ownedWorkspace(input.authUserId);
  const post = await prisma.postRequest.findFirst({ where: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId }, include: { variants: true, destinations: { include: { destination: true, publishJobs: true } } } });
  if (!post) throw new Error("Post request not found");
  const variant = post.variants.find((candidate) => candidate.isFinal);
  if (!variant) throw new Error("No approved final variant");
  if (variant.platform === "instagram" && (!variant.mediaAssetIds.length || variant.mediaAssetIds.length > 1)) throw new Error("Instagram image publishing requires exactly one image asset");
  const targets = post.destinations.filter((target) => target.destination.status === "CONNECTED");
  if (!targets.length) throw new Error("Connect a publishing-eligible Instagram destination first");
  const completed = targets.find((target) => target.publishJobs.some((job) => job.status === "PUBLISHED"));
  if (completed) return { status: "PUBLISHED" as const, jobs: completed.publishJobs.filter((job) => job.status === "PUBLISHED"), outcomes: [] as const, duplicate: true as const };
  const jobs = await Promise.all(targets.map((target) => enqueuePublishJob({ authUserId: input.authUserId, postRequestExternalId: post.externalId, postDestinationExternalId: target.externalId, mode: "NOW" })));
  const outcomes = await processDuePublishJobs({ maxJobs: jobs.length });
  return { status: outcomes.some((outcome) => outcome.status === "PUBLISHED") ? "PUBLISHED" : outcomes[0]?.status ?? "QUEUED", jobs, outcomes };
}

export async function cancelPostPublish(input: { authUserId: string; jobId: string }) { return { canceled: await cancelPublishJob(input) }; }
export async function reschedulePostPublish(input: { authUserId: string; jobId: string; scheduledFor: Date; timezone: string }) { return reschedulePublishJob(input); }

export async function listPostRequests(authUserId: string) {
  const workspace = await ownedWorkspace(authUserId);
  return prisma.postRequest.findMany({ where: { workspaceId: workspace.dbId }, orderBy: { createdAt: "desc" }, include: { variants: true, occurrences: true, destinations: { include: { destination: true, publishJobs: { include: { attempts: true, receipt: true } } } } }, take: 50 });
}
