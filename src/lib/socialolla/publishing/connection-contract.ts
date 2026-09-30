import { prisma } from "@/lib/db/prisma";
import {
  allPlatformCapabilities,
  platformCapabilities,
  platformLabel,
  type PlatformCapabilities,
  type PublishingPlatform,
} from "./platform-adaptation";

export type ConnectionStatus = "NOT_CONNECTED" | "CONNECTED" | "REAUTH_REQUIRED" | "UNSUPPORTED";

export type ConnectionDestinationView = Readonly<{
  externalId: string;
  platform: PublishingPlatform;
  label: string;
  accountLabel: string | null;
  platformUserId: string | null;
  status: ConnectionStatus;
  scopes: readonly string[];
  eligibilityVerified: boolean;
  tokenPresent: boolean;
}>;

export type ConnectionActionResult = Readonly<{
  status: "AVAILABLE" | "UNSUPPORTED" | "REAUTH_REQUIRED";
  authorizationPath?: string;
  reason?: string;
}>;

export class ConnectionUnsupportedError extends Error {
  constructor(platform: PublishingPlatform) {
    super(`${platformLabel(platform)} connection requires provider approval and a configured OAuth adapter.`);
    this.name = "ConnectionUnsupportedError";
  }
}

export type PublishingConnectionAdapter = Readonly<{
  platform: PublishingPlatform;
  capabilities: PlatformCapabilities;
  requiredScopes: readonly string[];
  externalApprovalRequired: boolean;
  connect(input: { returnTo?: string }): Promise<ConnectionActionResult>;
  callback(input: { code: string; state: string }): Promise<ConnectionActionResult>;
  refresh(input: { destinationExternalId: string }): Promise<ConnectionActionResult>;
  disconnect(input: { destinationExternalId: string }): Promise<ConnectionActionResult>;
  verifyEligibility(input: { destinationExternalId: string }): Promise<ConnectionActionResult>;
  listDestinations(input: { workspaceId: string }): Promise<readonly ConnectionDestinationView[]>;
}>;

function statusView(status: string): ConnectionStatus {
  if (status === "CONNECTED" || status === "REAUTH_REQUIRED" || status === "DISCONNECTED") {
    return status === "DISCONNECTED" ? "NOT_CONNECTED" : status;
  }
  return "NOT_CONNECTED";
}

async function listDestinations(platform: PublishingPlatform, workspaceId: string): Promise<readonly ConnectionDestinationView[]> {
  const rows = await prisma.destination.findMany({ where: { workspaceId, platform }, orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({
    externalId: row.externalId,
    platform,
    label: row.label,
    accountLabel: row.accountLabel,
    platformUserId: row.platformUserId,
    status: statusView(row.status),
    scopes: [...row.scopes],
    eligibilityVerified: Boolean(row.publishingEligibilityVerifiedAt),
    tokenPresent: Boolean(row.accessTokenCiphertext),
  }));
}

function unavailableAction(platform: PublishingPlatform): ConnectionActionResult {
  return { status: "UNSUPPORTED", reason: new ConnectionUnsupportedError(platform).message };
}

export function createApprovalGatedConnectionAdapter(platform: PublishingPlatform): PublishingConnectionAdapter {
  const capabilities = platformCapabilities(platform);
  if (!capabilities) throw new Error(`No connection capabilities exist for ${platform}`);
  return {
    platform,
    capabilities,
    requiredScopes: capabilities.requiredScopes,
    externalApprovalRequired: capabilities.externalApprovalRequired,
    async connect() { return unavailableAction(platform); },
    async callback() { return unavailableAction(platform); },
    async refresh() { return unavailableAction(platform); },
    async disconnect() { return unavailableAction(platform); },
    async verifyEligibility() { return unavailableAction(platform); },
    async listDestinations(input) { return listDestinations(platform, input.workspaceId); },
  };
}

/**
 * Instagram keeps its existing route and token-exchange implementation. This
 * adapter makes that route discoverable through the same connection contract
 * without moving or duplicating OAuth state handling.
 */
export function createInstagramConnectionAdapter(): PublishingConnectionAdapter {
  const platform: PublishingPlatform = "instagram";
  const capabilities = platformCapabilities(platform);
  if (!capabilities) throw new Error("Instagram connection capabilities are unavailable");
  return {
    platform,
    capabilities,
    requiredScopes: capabilities.requiredScopes,
    externalApprovalRequired: capabilities.externalApprovalRequired,
    async connect() { return { status: "AVAILABLE", authorizationPath: "/api/meta/instagram/publish/connect" }; },
    async callback() { return { status: "AVAILABLE", authorizationPath: "/api/meta/instagram/publish/callback" }; },
    async refresh(input) { return { status: "REAUTH_REQUIRED", reason: `Use the existing Instagram reconnect flow for ${input.destinationExternalId}.` }; },
    async disconnect(input) { return { status: "AVAILABLE", reason: `Use the existing Instagram disconnect action for ${input.destinationExternalId}.` }; },
    async verifyEligibility(input) { return { status: "AVAILABLE", reason: `Use the existing Instagram eligibility check for ${input.destinationExternalId}.` }; },
    async listDestinations(input) { return listDestinations(platform, input.workspaceId); },
  };
}

export function createPublishingConnectionAdapters(): Readonly<Record<PublishingPlatform, PublishingConnectionAdapter>> {
  const adapters = Object.fromEntries(allPlatformCapabilities().map((capabilities) => [
    capabilities.platform,
    capabilities.platform === "instagram" ? createInstagramConnectionAdapter() : createApprovalGatedConnectionAdapter(capabilities.platform),
  ]));
  return adapters as Record<PublishingPlatform, PublishingConnectionAdapter>;
}
