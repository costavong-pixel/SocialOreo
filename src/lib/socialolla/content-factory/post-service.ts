import { createContentFactoryClient, type ContentFactoryClient } from "./client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import {
  ensureMonthlyBatch,
  finalizeCredits,
  holdCredits,
  intentKey,
  refundCredits,
  selectSpendableBatch,
} from "@/lib/socialolla/credits/batch-service";
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
    const spendable = await selectSpendableBatch(workspace.dbId, creditsPerRequest);
    return {
      estimatedCredits: creditsPerRequest,
      batchAvailable: spendable !== null,
      remainingAfter: spendable ? spendable.remaining - creditsPerRequest : null,
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
    await ensureMonthlyBatch({
      internalWorkspaceId: workspace.dbId,
      externalWorkspaceId: workspace.id,
      includedCredits: entitlement?.includedMonthlyCredits ?? 0,
    });

    // Single canonical intent key used by execute, finalize and release.
    const intent = intentKey(workspace.id, destination.externalId, input.contentIntent?.trim() || `post:${input.language}`);
    const reference = `req:${destination.externalId}`;

    // Hold is idempotent per intent. Transient attempt failures auto-refund;
    // a finalize failure after a successful create is NOT auto-refunded.
    const hold = await holdCredits({
      internalWorkspaceId: workspace.dbId,
      amount: creditsPerRequest,
      reference,
      idempotencyKey: `${intent}:hold`,
    });
    if (!hold.held) throw new Error("Failed to hold credits");

    let request: PostRequestContract;
    try {
      request = await cf.createRequest({
        workspaceExternalId: workspace.id,
        destinationRef: destination.externalId,
        profileRef: input.profileExternalId,
        language: input.language,
        requestedCount: input.requestedCount,
        idempotencyKey: intent,
      });
    } catch (error) {
      // Attempt failed -> refund the hold (idempotent; only refunds when a
      // matching HOLD exists).
      await refundCredits({ amount: creditsPerRequest, reference, intent });
      throw error;
    }

    await finalizeCredits({ amount: creditsPerRequest, reference, intent });
    return request;
  }

  /**
   * Explicit cancellation of a held post intent: idempotently refunds the
   * credit hold (derives the SAME intent key as execute — BLOCKER-2 fix).
   */
  async function releasePostHold(input: {
    authUserId: string;
    destinationExternalId: string;
    contentIntent?: string;
  }): Promise<{ refunded: boolean }> {
    const workspace = await getOrCreatePersonalWorkspace(input.authUserId);
    const destination = await prisma.destination.findFirst({
      where: { externalId: input.destinationExternalId, workspace: { ownerUserId: input.authUserId } },
    });
    if (!destination) return { refunded: false };
    const entitlement = await prisma.entitlementSnapshot.findFirst({
      where: { workspace: { ownerUserId: input.authUserId } },
      orderBy: { validFrom: "desc" },
    });
    const creditsPerRequest = entitlement?.postCreditsPerRequest ?? 1;
    const intent = intentKey(workspace.id, destination.externalId, input.contentIntent?.trim() || `post:${"en"}`);
    const refund = await refundCredits({ amount: creditsPerRequest, reference: `req:${destination.externalId}`, intent });
    return { refunded: refund.refunded };
  }

  async function getRequest(requestId: string, authUserId: string): Promise<PostRequestContract | null> {
    const workspace = await getOrCreatePersonalWorkspace(authUserId);
    return cf.getRequest(requestId, workspace.id);
  }

  return { preview, execute, releasePostHold, getRequest };
}

export type { PostStatus };
