import { prisma } from "@/lib/db/prisma";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import {
  platformCapabilities,
  platformFlagName,
  type PlatformCapabilities,
  type PublishingPlatform,
} from "./platform-adaptation";
import {
  PublishingProviderClaimLostError,
  PublishingProviderDisabledError,
  PublishingProviderRequestError,
  postPublishingEnabled,
  type PublishProvider,
  type PublishProviderInput,
} from "./provider";
import type { ProviderReceipt } from "./contracts";
import { sanitizeProviderReceipt } from "./contracts";
import { decryptDestinationToken } from "./token-crypto";

export type RemoteProviderContext = Readonly<{
  input: PublishProviderInput;
  capabilities: PlatformCapabilities;
  platformUserId: string;
  accessToken: string;
  title: string;
  text: string;
  link?: string;
  mediaUrls: readonly string[];
  mediaKinds: readonly string[];
  mediaBytes: readonly Uint8Array[];
  mediaMimeTypes: readonly string[];
}>;

export type RemoteProviderRequest = Readonly<{
  url?: string;
  init?: RequestInit;
  receipt?: (response: unknown, context: RemoteProviderContext, rawResponse?: Response) => ProviderReceipt;
  /** Multi-step provider choreography is executed only after the claim boundary. */
  execute?: (fetcher: typeof fetch, context: RemoteProviderContext) => Promise<ProviderReceipt>;
}>;

function linkFromText(text: string): string | undefined {
  return text.match(/https?:\/\/[^\s)]+/i)?.[0];
}

function errorClass(status: number): { retryable: boolean; reconciliationRequired: boolean } {
  if (status === 408 || status === 425 || status === 429) return { retryable: true, reconciliationRequired: false };
  if (status >= 500) return { retryable: true, reconciliationRequired: true };
  return { retryable: false, reconciliationRequired: false };
}

async function responseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try { return await response.json(); } catch { return undefined; }
  }
  try { return await response.text(); } catch { return undefined; }
}

function safeAssetKind(value: string): "image" | "video" {
  if (value === "image" || value === "video") return value;
  throw new Error("Publishing media asset kind is invalid");
}

async function loadContext(storage: PrivateMediaStorage, input: PublishProviderInput, capabilities: PlatformCapabilities): Promise<RemoteProviderContext> {
  const destination = await prisma.destination.findFirst({
    where: { externalId: input.destinationExternalId, workspaceId: input.workspaceId, platform: input.platform, status: "CONNECTED" },
    include: { workspace: { select: { externalId: true } } },
  });
  if (!destination?.platformUserId || !destination.accessTokenCiphertext) throw new Error(`${input.platform} destination needs reconnection before publishing`);
  if (destination.providerDisabled) throw new PublishingProviderDisabledError(input.platform);
  if (!destination.publishingEligibilityVerifiedAt) throw new Error(`${input.platform} publishing eligibility has not been verified`);
  if (!capabilities.requiredScopes.every((scope) => destination.scopes.includes(scope))) throw new Error(`${input.platform} destination is missing publishing permission`);
  if (destination.accessTokenExpiresAt && destination.accessTokenExpiresAt.getTime() <= Date.now()) throw new Error(`${input.platform} destination token expired`);
  if (input.variant.content.text.length > capabilities.maxTextLength) throw new Error(`${input.platform} text exceeds the platform limit`);
  if (capabilities.title && (input.variant.content.title?.length ?? 0) > capabilities.maxTitleLength) throw new Error(`${input.platform} title exceeds the platform limit`);
  if (input.variant.content.mediaAssetIds.length > capabilities.maxMediaItems) throw new Error(`${input.platform} media count exceeds the platform limit`);
  const accessToken = decryptDestinationToken(input.platform, destination.accessTokenCiphertext);
  const mediaUrls: string[] = [];
  const mediaKinds: string[] = [];
  const mediaBytes: Uint8Array[] = [];
  const mediaMimeTypes: string[] = [];
  for (const assetId of input.variant.content.mediaAssetIds) {
    const asset = await prisma.mediaAsset.findFirst({ where: { externalId: assetId, workspaceId: input.workspaceId, status: "READY" } });
    if (!asset) throw new Error(`${input.platform} publishing media asset is unavailable`);
    const kind = safeAssetKind(asset.kind);
    if ((kind === "image" && !capabilities.image) || (kind === "video" && !capabilities.video)) throw new Error(`${input.platform} adapter does not support ${kind} media`);
    const grant = await storage.createControlledReadGrant({
      descriptor: {
        assetId: asset.externalId,
        ownerWorkspaceId: destination.workspace.externalId,
        kind,
        mimeType: asset.mimeType,
        detectedMimeType: asset.detectedMimeType,
        sizeBytes: asset.sizeBytes,
        originalName: asset.originalName,
        storageKey: asset.storageKey,
      },
      expiresInSeconds: 300,
    });
    mediaUrls.push(grant.grant);
    mediaKinds.push(kind);
    mediaBytes.push(await storage.read({
      assetId: asset.externalId,
      ownerWorkspaceId: destination.workspace.externalId,
      kind,
      mimeType: asset.mimeType,
      detectedMimeType: asset.detectedMimeType,
      sizeBytes: asset.sizeBytes,
      originalName: asset.originalName,
      storageKey: asset.storageKey,
    }));
    mediaMimeTypes.push(asset.mimeType);
  }
  return {
    input,
    capabilities,
    platformUserId: destination.platformUserId,
    accessToken,
    title: input.variant.content.title?.trim() ?? "",
    text: input.variant.content.text.trim(),
    link: input.variant.content.link ?? linkFromText(input.variant.content.text),
    mediaUrls,
    mediaKinds,
    mediaBytes,
    mediaMimeTypes,
  };
}

export function createRemotePublishingProvider(
  platform: PublishingPlatform,
  storage: PrivateMediaStorage,
  buildRequest: (context: RemoteProviderContext) => Promise<RemoteProviderRequest> | RemoteProviderRequest,
  fetcher: typeof fetch = fetch,
): PublishProvider {
  const capabilities = platformCapabilities(platform);
  if (!capabilities) throw new Error(`No publishing capabilities exist for ${platform}`);
  return {
    platform,
    capabilities,
    enabled: true,
    async publish(input) {
      if (!postPublishingEnabled(platform) || process.env[platformFlagName(platform)] !== "true" || providerDisabledEnabled()) throw new PublishingProviderDisabledError(platform);
      const context = await loadContext(storage, input, capabilities);
      const request = await buildRequest(context);
      if (input.onProviderRequestStart && !(await input.onProviderRequestStart())) throw new PublishingProviderClaimLostError();
      if (request.execute) return sanitizeProviderReceipt(await request.execute(fetcher, context));
      if (!request.url || !request.init || !request.receipt) throw new Error(`${platform} provider request is incomplete`);
      let response: Response;
      try {
        response = await fetcher(request.url, request.init);
      } catch {
        throw new PublishingProviderRequestError(`${platform} provider request failed before a response was received`, { retryable: true, reconciliationRequired: true });
      }
      const body = await responseBody(response);
      if (!response.ok) {
        const classification = errorClass(response.status);
        throw new PublishingProviderRequestError(`${platform} provider rejected the publish request (${response.status})`, classification);
      }
      return sanitizeProviderReceipt(request.receipt(body, context, response));
    },
  };
}

export function jsonHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" };
}

export function formHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
}
