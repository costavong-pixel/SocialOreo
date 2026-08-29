import { prisma } from "@/lib/db/prisma";
import { decryptInstagramToken, encryptInstagramToken } from "@/lib/instagram-insights/token-crypto";
import { getInstagramPublishingConfig } from "@/lib/instagram-publishing/config";
import { refreshInstagramPublishingToken } from "@/lib/instagram-publishing/client";
import { publishInstagramImage } from "@/lib/instagram-publishing/publish-client";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import type { PrivateMediaStorage } from "@/lib/socialolla/media/media";
import { platformCapabilities } from "./platform-adaptation";
import { livePublishingRuntimeAllowed, PublishingProviderClaimLostError, PublishingProviderDisabledError, type PublishProvider, type PublishProviderInput } from "./provider";

export function createInstagramPublishingProvider(storage: PrivateMediaStorage): PublishProvider {
  const capabilities = platformCapabilities("instagram");
  if (!capabilities) throw new Error("Instagram publishing capabilities are unavailable");
  return {
    platform: "instagram",
    capabilities,
    enabled: true,
    async publish(input: PublishProviderInput) {
      if (!livePublishingRuntimeAllowed() || providerDisabledEnabled() || process.env.SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED !== "true") throw new PublishingProviderDisabledError("instagram");
      const config = getInstagramPublishingConfig();
      if (!config) throw new Error("Instagram publishing configuration is unavailable");
      const destination = await prisma.destination.findFirst({
        where: { externalId: input.destinationExternalId, workspaceId: input.workspaceId, platform: "instagram", status: "CONNECTED" },
        include: { workspace: { select: { externalId: true } } },
      });
      if (!destination?.platformUserId || !destination.accessTokenCiphertext) throw new Error("Instagram destination needs reconnection before publishing");
      if (!destination.publishingEligibilityVerifiedAt) {
        await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: input.workspaceId }, data: { status: "REAUTH_REQUIRED" } });
        throw new Error("Instagram publishing eligibility has not been verified; reconnect before publishing");
      }
      const requiredScopes = ["instagram_business_basic", "instagram_business_content_publish"];
      if (!requiredScopes.every((scope) => destination.scopes.includes(scope))) {
        await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: input.workspaceId }, data: { status: "REAUTH_REQUIRED" } });
        throw new Error("Instagram destination is missing publishing permission; reconnect before publishing");
      }
      if (destination.accessTokenExpiresAt && destination.accessTokenExpiresAt.getTime() <= Date.now()) {
        await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: input.workspaceId }, data: { status: "REAUTH_REQUIRED" } });
        throw new Error("Instagram destination token expired; reconnect before publishing");
      }
      const assetId = input.variant.content.mediaAssetIds[0];
      if (!assetId) throw new Error("Instagram image publishing requires one owned image asset");
      const asset = await prisma.mediaAsset.findFirst({ where: { externalId: assetId, workspaceId: input.workspaceId, status: "READY" } });
      if (!asset || asset.kind !== "image" || asset.mimeType !== "image/jpeg") throw new Error("Instagram publishing requires one owned JPEG image asset");
      let token = decryptInstagramToken(destination.accessTokenCiphertext, config.tokenEncryptionKey);
      if (destination.accessTokenExpiresAt && destination.accessTokenExpiresAt.getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000 && destination.updatedAt.getTime() <= Date.now() - 24 * 60 * 60 * 1000) {
        try {
          const refreshed = await refreshInstagramPublishingToken(token);
          token = refreshed.access_token;
          await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: input.workspaceId, accessTokenCiphertext: destination.accessTokenCiphertext }, data: { accessTokenCiphertext: encryptInstagramToken(token, config.tokenEncryptionKey), accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000) } });
        } catch {
          await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: input.workspaceId }, data: { status: "REAUTH_REQUIRED" } });
          throw new Error("Instagram destination token needs re-authentication");
        }
      }
      const grant = await storage.createControlledReadGrant({ descriptor: { assetId: asset.externalId, ownerWorkspaceId: destination.workspace.externalId, kind: "image", mimeType: asset.mimeType, detectedMimeType: asset.detectedMimeType, sizeBytes: asset.sizeBytes, originalName: asset.originalName, storageKey: asset.storageKey }, expiresInSeconds: 300 });
      if (input.onProviderRequestStart && !(await input.onProviderRequestStart())) throw new PublishingProviderClaimLostError();
      return publishInstagramImage({ graphVersion: config.graphVersion, userId: destination.platformUserId, accessToken: token, controlledMediaUrl: grant.grant, caption: input.variant.content.text });
    },
  };
}
