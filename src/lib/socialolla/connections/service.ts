import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { isPublishingPlatform, type PublishingPlatform } from "@/lib/socialolla/publishing/platform-adaptation";
import { connectionClientConfig, connectionEnabled, connectionRedirectUri, connectionTokenEncryptionKey } from "./config";
import { connectionProvider } from "./provider-adapters";
import { decryptConnectionSecret, encryptConnectionSecret } from "./token-crypto";
import { toConnectionDestination, type ConnectionDestination, type DiscoveredConnectionDestination, type OAuthTokenSet } from "./contracts";

function platformValue(value: string): PublishingPlatform {
  const normalized = value.trim().toLowerCase();
  if (!isPublishingPlatform(normalized) || normalized === "instagram") throw new Error("Unsupported shared OAuth platform.");
  return normalized;
}

function tokenExpiry(token: OAuthTokenSet): Date | null {
  return token.expiresAt ?? null;
}

function externalId(): string {
  return `dst_${randomBytes(12).toString("base64url")}`;
}

function view(destination: { externalId: string; platform: string; label: string; accountLabel: string | null; status: string; scopes: string[]; providerDisabled: boolean }) {
  if (!isPublishingPlatform(destination.platform)) throw new Error("Stored destination platform is invalid.");
  return toConnectionDestination({ ...destination, platform: destination.platform, destinationType: connectionProvider(destination.platform)?.capabilities.destinationType ?? "ACCOUNT" });
}

export function connectionAvailable(platform: string, env: Record<string, string | undefined> = process.env): boolean {
  const normalized = platform.trim().toLowerCase();
  return isPublishingPlatform(normalized) && normalized !== "instagram" && Boolean(connectionProvider(normalized)) && connectionEnabled(normalized, env);
}

export function connectionConfiguration(platform: string, env: Record<string, string | undefined> = process.env) {
  const normalized = platformValue(platform);
  const adapter = connectionProvider(normalized);
  const client = connectionClientConfig(normalized, env);
  const redirectUri = connectionRedirectUri(normalized, env);
  if (!adapter || !client || !redirectUri) return null;
  return { platform: normalized, adapter, client, redirectUri };
}

export async function saveConnection(input: {
  userId: string;
  platform: string;
  token: OAuthTokenSet;
  destinations: readonly DiscoveredConnectionDestination[];
}) : Promise<readonly ConnectionDestination[]> {
  const platform = platformValue(input.platform);
  if (!connectionAvailable(platform)) throw new Error("Connection is disabled.");
  const adapter = connectionProvider(platform);
  const key = connectionTokenEncryptionKey(platform);
  if (!adapter || !key) throw new Error("Connection token encryption is not configured.");
  if (!adapter.requiredScopes.every((scope) => input.token.scopes.includes(scope))) throw new Error("OAuth token is missing the required connection scopes.");
  const eligible = input.destinations.filter((item) => item.eligible && item.platformUserId.trim());
  if (eligible.length === 0) throw new Error("No eligible destination was returned by the provider.");
  const workspace = await getOrCreatePersonalWorkspace(input.userId);
  const saved = await prisma.$transaction(async (tx) => {
    const entitlement = await tx.entitlementSnapshot.findFirst({ where: { workspaceId: workspace.dbId }, orderBy: { validFrom: "desc" }, select: { maxDestinations: true } });
    const maxDestinations = Math.max(1, entitlement?.maxDestinations ?? 1);
    const existing = await tx.destination.findMany({ where: { workspaceId: workspace.dbId }, select: { id: true, platform: true, platformUserId: true } });
    const existingKeys = new Set(existing.filter((item) => item.platform === platform && item.platformUserId).map((item) => item.platformUserId));
    const newCount = eligible.filter((item) => !existingKeys.has(item.platformUserId)).length;
    if (existing.length + newCount > maxDestinations) throw new Error("Destination limit reached for this plan.");
    const result: Array<{ externalId: string; platform: string; label: string; accountLabel: string | null; status: string; scopes: string[]; providerDisabled: boolean }> = [];
    for (const item of eligible) {
      const accessToken = item.accessToken ?? input.token.accessToken;
      const refreshToken = item.refreshToken ?? input.token.refreshToken ?? null;
      const data = {
        label: item.label,
        accountLabel: item.accountLabel ?? null,
        platformUserId: item.platformUserId,
        status: "CONNECTED" as const,
        providerDisabled: false,
        accessTokenCiphertext: encryptConnectionSecret(accessToken, key),
        refreshTokenCiphertext: refreshToken ? encryptConnectionSecret(refreshToken, key) : null,
        accessTokenExpiresAt: tokenExpiry(input.token),
        publishingEligibilityVerifiedAt: new Date(),
        scopes: [...input.token.scopes],
      };
      const current = await tx.destination.findFirst({ where: { workspaceId: workspace.dbId, platform, platformUserId: item.platformUserId } });
      const row = current
        ? await tx.destination.update({ where: { id: current.id }, data, select: { externalId: true, platform: true, label: true, accountLabel: true, status: true, scopes: true, providerDisabled: true } })
        : await tx.destination.create({ data: { externalId: externalId(), workspaceId: workspace.dbId, platform, ...data }, select: { externalId: true, platform: true, label: true, accountLabel: true, status: true, scopes: true, providerDisabled: true } });
      result.push(row);
    }
    return result;
  }, { isolationLevel: "Serializable" });
  return saved.map(view);
}

export async function listConnections(userId: string): Promise<readonly ConnectionDestination[]> {
  const workspace = await getOrCreatePersonalWorkspace(userId);
  const destinations = await prisma.destination.findMany({ where: { workspaceId: workspace.dbId }, select: { externalId: true, platform: true, label: true, accountLabel: true, status: true, scopes: true, providerDisabled: true }, orderBy: { createdAt: "asc" } });
  return destinations.filter((item) => isPublishingPlatform(item.platform)).map(view);
}

export async function disconnectConnection(input: { userId: string; platform: string; destinationExternalId: string }): Promise<void> {
  const platform = platformValue(input.platform);
  const config = connectionConfiguration(platform);
  const workspace = await getOrCreatePersonalWorkspace(input.userId);
  const destination = await prisma.destination.findFirst({ where: { externalId: input.destinationExternalId, workspaceId: workspace.dbId, platform }, select: { id: true, accessTokenCiphertext: true } });
  if (!destination) return;
  if (config && destination.accessTokenCiphertext) {
    const key = connectionTokenEncryptionKey(platform);
    if (key) {
      try { await config.adapter.revoke({ clientId: config.client.clientId, clientSecret: config.client.clientSecret, accessToken: decryptConnectionSecret(destination.accessTokenCiphertext, key) }); } catch { /* local disconnect still clears server state */ }
    }
  }
  await prisma.destination.update({ where: { id: destination.id }, data: { status: "DISCONNECTED", providerDisabled: true, accessTokenCiphertext: null, refreshTokenCiphertext: null, accessTokenExpiresAt: null, publishingEligibilityVerifiedAt: null, scopes: [] } });
}

export async function refreshConnection(input: { userId: string; platform: string; destinationExternalId: string }): Promise<ConnectionDestination> {
  const platform = platformValue(input.platform);
  if (!connectionAvailable(platform)) throw new Error("Connection is disabled.");
  const config = connectionConfiguration(platform);
  const key = connectionTokenEncryptionKey(platform);
  const workspace = await getOrCreatePersonalWorkspace(input.userId);
  const destination = await prisma.destination.findFirst({ where: { externalId: input.destinationExternalId, workspaceId: workspace.dbId, platform }, select: { id: true, externalId: true, platform: true, platformUserId: true, label: true, accountLabel: true, status: true, scopes: true, providerDisabled: true, accessTokenCiphertext: true, refreshTokenCiphertext: true } });
  if (!destination || !config || !key || !destination.refreshTokenCiphertext) throw new Error("Destination requires reconnection.");
  try {
    if (!connectionAvailable(platform)) throw new Error("Connection is disabled.");
    const refreshToken = decryptConnectionSecret(destination.refreshTokenCiphertext, key);
    if (!connectionAvailable(platform)) throw new Error("Connection is disabled.");
    const token = await config.adapter.refresh({ clientId: config.client.clientId, clientSecret: config.client.clientSecret, refreshToken });
    if (!connectionAvailable(platform)) throw new Error("Connection is disabled.");
    const discovered = await config.adapter.discoverDestinations({ token });
    const matched = discovered.find((item) => item.platformUserId === destination.platformUserId);
    if (!matched?.eligible) throw new Error("Destination eligibility could not be reverified.");
    const accessToken = matched.accessToken ?? token.accessToken;
    if (!connectionAvailable(platform)) throw new Error("Connection is disabled.");
    const next = await prisma.destination.update({ where: { id: destination.id }, data: { status: "CONNECTED", providerDisabled: false, accessTokenCiphertext: encryptConnectionSecret(accessToken, key), refreshTokenCiphertext: (matched.refreshToken ?? token.refreshToken ?? refreshToken) ? encryptConnectionSecret(matched.refreshToken ?? token.refreshToken ?? refreshToken, key) : null, accessTokenExpiresAt: tokenExpiry(token), publishingEligibilityVerifiedAt: new Date(), scopes: [...token.scopes] }, select: { externalId: true, platform: true, label: true, accountLabel: true, status: true, scopes: true, providerDisabled: true } });
    return view(next);
  } catch {
    await prisma.destination.updateMany({ where: { id: destination.id, workspaceId: workspace.dbId }, data: { status: "REAUTH_REQUIRED" } });
    return view({ ...destination, status: "REAUTH_REQUIRED" });
  }
}
