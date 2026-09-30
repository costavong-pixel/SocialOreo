import { prisma } from "@/lib/db/prisma";
import { decryptInstagramToken } from "@/lib/instagram-insights/token-crypto";
import type { MediaDescriptor, PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { adaptPostVariant, platformCapabilities, type PlatformCapabilities, type PublishingPlatform } from "./platform-adaptation";
import { postPublishingEnabled } from "./gates";
import type { ProviderReceipt } from "./contracts";
import type { PublishProvider, PublishProviderInput } from "./provider";
import { PublishingProviderClaimLostError, PublishingProviderDisabledError } from "./provider-errors";

export type PlatformMediaContext = Readonly<{ descriptor: MediaDescriptor; grant: string }>;
export type PlatformPublishContext = Readonly<{
  input: PublishProviderInput;
  capabilities: PlatformCapabilities;
  destination: { id: string; externalId: string; platformUserId: string; scopes: string[]; accessTokenExpiresAt: Date | null };
  accessToken: string;
  media: readonly PlatformMediaContext[];
  storage: PrivateMediaStorage;
  beforeProviderRequest: () => Promise<void>;
}>;
export type PlatformAdapter = Readonly<{
  platform: PublishingPlatform;
  provider: string;
  publish(context: PlatformPublishContext): Promise<ProviderReceipt>;
}>;

export class PlatformPublishingError extends Error {
  constructor(message: string, public readonly retryable = false, public readonly reconciliationRequired = false, public readonly status?: number) {
    super(message);
    this.name = "PlatformPublishingError";
  }
}

function tokenEncryptionKey(platform: PublishingPlatform): string {
  const keyName = `SOCIALOLLA_${platform.toUpperCase()}_TOKEN_ENCRYPTION_KEY`;
  const key = process.env[keyName] ?? process.env.SOCIALOLLA_TOKEN_ENCRYPTION_KEY ?? process.env.META_INSTAGRAM_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new PlatformPublishingError(`${platform} destination token encryption is not configured`);
  return key;
}

function safeProviderError(provider: string, status?: number): PlatformPublishingError {
  const retryable = status === 408 || status === 409 || status === 425 || status === 429 || (status !== undefined && status >= 500);
  // A response-level rate limit or timeout is a definitive provider rejection
  // and may be retried by the shared job engine. Conflicts and 5xx responses
  // stay reconciliation-required because the provider may have accepted the
  // mutation before returning an ambiguous response.
  const reconciliationRequired = status === 409 || (status !== undefined && status >= 500);
  return new PlatformPublishingError(`${provider} rejected the publishing request.`, retryable, reconciliationRequired, status);
}

async function readProviderBody(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

export async function providerJsonRequest(context: PlatformPublishContext, input: { url: string; method?: string; headers?: Record<string, string>; body?: BodyInit }): Promise<{ response: Response; body: Record<string, unknown> }> {
  await context.beforeProviderRequest();
  let response: Response;
  try {
    response = await fetch(input.url, {
      method: input.method ?? "POST",
      headers: { Authorization: `Bearer ${context.accessToken}`, ...(input.headers ?? {}) },
      body: input.body,
      cache: "no-store",
    });
  } catch {
    throw new PlatformPublishingError(`${context.capabilities.provider} transport failed; reconciliation is required before retry.`, true, true);
  }
  const body = await readProviderBody(response);
  if (!response.ok) throw safeProviderError(context.capabilities.provider, response.status);
  return { response, body };
}

async function loadContext(input: PublishProviderInput, storage: PrivateMediaStorage): Promise<PlatformPublishContext> {
  const capabilities = platformCapabilities(input.platform);
  if (!capabilities) throw new PlatformPublishingError(`Unsupported publishing platform: ${input.platform}`);
  const destination = await prisma.destination.findFirst({
    where: { externalId: input.destinationExternalId, workspaceId: input.workspaceId, platform: capabilities.platform, status: "CONNECTED" },
    select: {
      id: true,
      externalId: true,
      platformUserId: true,
      accessTokenCiphertext: true,
      accessTokenExpiresAt: true,
      providerDisabled: true,
      publishingEligibilityVerifiedAt: true,
      scopes: true,
      workspace: { select: { externalId: true } },
    },
  });
  if (!destination?.platformUserId || !destination.accessTokenCiphertext) throw new PlatformPublishingError(`${capabilities.platform} destination needs reconnection before publishing`);
  if (destination.providerDisabled) throw new PublishingProviderDisabledError(capabilities.platform);
  if (!destination.publishingEligibilityVerifiedAt) {
    await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: input.workspaceId }, data: { status: "REAUTH_REQUIRED" } });
    throw new PlatformPublishingError(`${capabilities.platform} publishing eligibility has not been verified; reconnect before publishing`);
  }
  if (!capabilities.requiredScopes.every((scope) => destination.scopes.includes(scope))) {
    await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: input.workspaceId }, data: { status: "REAUTH_REQUIRED" } });
    throw new PlatformPublishingError(`${capabilities.platform} destination is missing publishing permission; reconnect before publishing`);
  }
  if (destination.accessTokenExpiresAt && destination.accessTokenExpiresAt.getTime() <= Date.now()) {
    await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: input.workspaceId }, data: { status: "REAUTH_REQUIRED" } });
    throw new PlatformPublishingError(`${capabilities.platform} destination token expired; reconnect before publishing`);
  }

  const adapted = adaptPostVariant(capabilities.platform, { text: input.variant.content.text, mediaAssetIds: input.variant.content.mediaAssetIds });
  if (!adapted.ok) throw new PlatformPublishingError(adapted.errors.join(" "), false, false);
  const media: PlatformMediaContext[] = [];
  for (const assetId of adapted.content.mediaAssetIds) {
    const asset = await prisma.mediaAsset.findFirst({ where: { externalId: assetId, workspaceId: input.workspaceId, status: "READY" } });
    if (!asset) throw new PlatformPublishingError(`${capabilities.platform} media asset is not available for this workspace`);
    const kind = asset.kind === "image" || asset.kind === "video" ? asset.kind : null;
    if (!kind || (kind === "image" && !capabilities.image) || (kind === "video" && !capabilities.video)) {
      throw new PlatformPublishingError(`${capabilities.platform} does not support this media asset type`);
    }
    const descriptor: MediaDescriptor = {
      assetId: asset.externalId,
      ownerWorkspaceId: destination.workspace.externalId,
      kind,
      mimeType: asset.mimeType,
      detectedMimeType: asset.detectedMimeType,
      sizeBytes: asset.sizeBytes,
      originalName: asset.originalName,
      storageKey: asset.storageKey,
    };
    const grant = await storage.createControlledReadGrant({ descriptor, expiresInSeconds: 300 });
    media.push({ descriptor, grant: grant.grant });
  }

  let providerBoundaryStarted = false;
  const beforeProviderRequest = async () => {
    if (providerBoundaryStarted) return;
    if (input.onProviderRequestStart && !(await input.onProviderRequestStart())) throw new PublishingProviderClaimLostError();
    providerBoundaryStarted = true;
  };
  return {
    input,
    capabilities,
    destination: {
      id: destination.id,
      externalId: destination.externalId,
      platformUserId: destination.platformUserId,
      scopes: [...destination.scopes],
      accessTokenExpiresAt: destination.accessTokenExpiresAt,
    },
    accessToken: decryptInstagramToken(destination.accessTokenCiphertext, tokenEncryptionKey(capabilities.platform)),
    media,
    storage,
    beforeProviderRequest,
  };
}

export function createPlatformPublishingProvider(adapter: PlatformAdapter, storage: PrivateMediaStorage): PublishProvider {
  const enabled = postPublishingEnabled(adapter.platform, process.env, Boolean(storage));
  return {
    platform: adapter.platform,
    capabilities: platformCapabilities(adapter.platform)!,
    enabled,
    async publish(input) {
      if (!enabled) throw new PublishingProviderDisabledError(adapter.platform);
      const context = await loadContext(input, storage);
      return adapter.publish(context);
    },
  };
}
