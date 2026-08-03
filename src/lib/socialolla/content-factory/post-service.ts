import { createContentFactoryClient, type ContentFactoryClient } from "./client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { finalizeCredits, holdCredits, refundCredits, ensureMonthlyBatch } from "@/lib/socialolla/credits/batch-service";
import type { PostRequestContract, PostStatus } from "@/lib/socialolla/contracts";

export interface PostCostPreview {
  estimatedCredits: number;
  batchAvailable: boolean;
  remainingAfter: number | null;
}

export interface PostExecutionInput {
  authUserId: string;
  destinationExternalId: string;
  profileExternalId?: string;
  language: string;
  requestedCount: number;
  /** Required protected-action confirmation. Guards against accidental publish. */
  confirmed: boolean;
  contentIntent?: string;
}

/**
 * Post service orchestrator (provider-disabled by default). Enforces:
 * - authenticated workspace binding (server-derived from the session user);
 * - destination selection + profile context;
 * - plan/entitlement checks and a cost preview;
 * - exact confirmation before execution;
 * - request + credit idempotency (no duplicate credit charge, no duplicate job);
 * - mapped status/evidence from the Content Factory contract.
 */
export function createPostService(client?: ContentFactoryClient) {
  const cf = client ?? createContentFactoryClient();

  async function preview(authUserId: string, destinationExternalId: string, requestedCount: number): Promise<PostCostPreview> {
    const workspace = await getOrCreatePersonalWorkspace(authUserId);
    const destination = await prisma.destination.findFirst({
      where: { externalId: destinationExternalId, workspace: { ownerUserId: authUserId } },
    });
    if (!destination) throw new Error("Destination not found for this workspace");
    const entitlement = await prisma.entitlementSnapshot.findFirst({
      where: { workspace: { ownerUserId: authUserId } },
      orderBy: { validFrom: "desc" },
    });
    const creditsPerRequest = entitlement?.postCreditsPerRequest ?? 1;
    const batch = await ensureMonthlyBatch(workspace.id, entitlement?.includedMonthlyCredits ?? 0);
    return {
      estimatedCredits: creditsPerRequest,
      batchAvailable: batch !== null && batch.remaining >= creditsPerRequest,
      remainingAfter: batch ? batch.remaining - creditsPerRequest : null,
    };
  }

  async function execute(input: PostExecutionInput): Promise<PostRequestContract> {
    if (!input.confirmed) throw new Error("Protected action requires exact confirmation");
    const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
    const destination = await prisma.destination.findFirst({
      where: { externalId: input.destinationExternalId, workspace: { ownerUserId: input.authUserId } },
    });
    if (!destination) throw new Error("Destination not found for this workspace");
    const entitlement = await prisma.entitlementSnapshot.findFirst({
      where: { workspace: { ownerUserId: input.authUserId } },
      orderBy: { validFrom: "desc" },
    });
    const creditsPerRequest = entitlement?.postCreditsPerRequest ?? 1;
    const batch = await ensureMonthlyBatch(workspace.id, entitlement?.includedMonthlyCredits ?? 0);
    if (!batch || batch.remaining < creditsPerRequest) {
      throw new Error("Insufficient credits");
    }

    // Stable intent key -> idempotent across retries, no duplicate charge/job.
    const intent = input.contentIntent?.trim() || `post:${input.destinationExternalId}:${input.language}`;
    const idempotencyKey = `so:${workspace.id}:${intent.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 96)}`;
    const reference = `req:${input.destinationExternalId}`;

    const hold = await holdCredits({
      batchExternalId: batch.id,
      amount: creditsPerRequest,
      reference,
      idempotencyKey: `${idempotencyKey}:hold`,
    });
    if (!hold.held) throw new Error("Failed to hold credits");

    try {
      const request = await cf.createRequest({
        workspaceExternalId: workspace.id,
        destinationRef: destination.externalId,
        profileRef: input.profileExternalId,
        language: input.language,
        requestedCount: input.requestedCount,
        idempotencyKey,
      });
      await finalizeCredits({
        batchExternalId: batch.id,
        amount: creditsPerRequest,
        reference,
        idempotencyKey: `${idempotencyKey}:finalize`,
      });
      return request;
    } catch (error) {
      await refundCredits({
        batchExternalId: batch.id,
        amount: creditsPerRequest,
        reference,
        idempotencyKey: `${idempotencyKey}:refund`,
      });
      throw error;
    }
  }

  async function getRequest(requestId: string, authUserId: string): Promise<PostRequestContract | null> {
    const workspace = await getOrCreatePersonalWorkspace(authUserId);
    return cf.getRequest(requestId, workspace.id);
  }

  return { preview, execute, getRequest };
}

export type { PostStatus };
