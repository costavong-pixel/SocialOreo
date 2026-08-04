import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { createPostService } from "@/lib/socialolla/content-factory/post-service";

function newPostRequestExternalId(): string {
  return `req_${randomBytes(12).toString("base64url")}`;
}

/**
 * Slice C — Post customer flow server actions (provider-disabled).
 * Create from topic/offer/product/link with profile+destination selection,
 * persist the request + platform variants + first occurrence, then edit,
 * approve and provider-disabled schedule. No live transport.
 */
export async function createPostRequest(input: {
  authUserId: string;
  destinationExternalId: string;
  profileExternalId?: string;
  language: string;
  requestedCount: number;
  contentIntent?: string;
  confirmed: boolean;
}) {
  const service = createPostService();
  const preview = await service.preview(input.authUserId, input.destinationExternalId, input.requestedCount);
  if (!preview.batchAvailable) throw new Error("Insufficient credits");
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const intent = `${workspace.id}:${input.destinationExternalId}:${(input.contentIntent ?? "post").slice(0, 64)}`;
  const request = await service.execute({
    authUserId: input.authUserId,
    destinationExternalId: input.destinationExternalId,
    profileExternalId: input.profileExternalId,
    language: input.language,
    requestedCount: input.requestedCount,
    confirmed: input.confirmed,
    contentIntent: input.contentIntent,
  });

  const postRequest = await prisma.postRequest.create({
    data: {
      externalId: newPostRequestExternalId(),
      workspaceId: workspace.dbId,
      destinationRef: input.destinationExternalId,
      profileRef: input.profileExternalId,
      language: input.language,
      status: "REVIEW",
      intentKey: intent,
      cfRequestRef: request.id,
    },
  });

  await prisma.postVariant.create({
    data: {
      postRequestId: postRequest.id,
      platform: "instagram",
      title: `Draft title (${input.language})`,
      caption: `Provider-disabled draft caption for destination in ${input.language}.`,
      hashtags: [],
      cta: "Learn more",
      variantLocale: `${input.language}-US`,
    },
  });

  await prisma.postOccurrence.create({
    data: {
      postRequestId: postRequest.id,
      kind: "FIRST",
      status: "LIGHT_DRAFT",
      destinationRef: input.destinationExternalId,
    },
  });

  return { postRequestId: postRequest.externalId, cfRequestId: request.id, status: "REVIEW" };
}

export async function updatePostVariant(input: {
  authUserId: string;
  postRequestExternalId: string;
  title: string;
  caption?: string;
  hashtags?: string[];
  cta?: string;
  isFinal?: boolean;
}) {
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const postRequest = await prisma.postRequest.findFirst({
    where: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId },
  });
  if (!postRequest) throw new Error("Post request not found");
  const variant = await prisma.postVariant.findFirst({ where: { postRequestId: postRequest.id } });
  if (!variant) throw new Error("Variant not found");
  await prisma.postVariant.update({
    where: { id: variant.id },
    data: {
      title: input.title,
      caption: input.caption,
      hashtags: input.hashtags ?? [],
      cta: input.cta,
      isFinal: input.isFinal ?? false,
    },
  });
  return { updated: true };
}

export async function approveAndSchedulePost(input: {
  authUserId: string;
  postRequestExternalId: string;
  scheduleAt: Date;
  timezone: string;
  confirmed: boolean;
}) {
  if (!input.confirmed) throw new Error("Protected action requires exact confirmation");
  const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
  const postRequest = await prisma.postRequest.findFirst({
    where: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId },
  });
  if (!postRequest) throw new Error("Post request not found");
  const variant = await prisma.postVariant.findFirst({ where: { postRequestId: postRequest.id, isFinal: true } });
  if (!variant) throw new Error("No approved final variant");

  await prisma.$transaction([
    prisma.postRequest.update({ where: { id: postRequest.id }, data: { status: "SCHEDULED" } }),
    prisma.postOccurrence.updateMany({
      where: { postRequestId: postRequest.id, kind: "FIRST" },
      data: { status: "SCHEDULED", scheduleAt: input.scheduleAt, timezone: input.timezone },
    }),
  ]);
  return { status: "SCHEDULED" };
}

export async function listPostRequests(authUserId: string) {
  const workspace = await getOrCreatePersonalWorkspace(authUserId);
  return prisma.postRequest.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { createdAt: "desc" },
    include: { variants: true, occurrences: true },
    take: 50,
  });
}
