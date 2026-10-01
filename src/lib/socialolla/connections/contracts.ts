import type { DestinationType, PlatformCapabilities, PublishingPlatform } from "@/lib/socialolla/publishing/platform-adaptation";

export type ConnectionState = "NOT_CONNECTED" | "CONNECTED" | "REAUTH_REQUIRED" | "EXTERNAL_APPROVAL_REQUIRED" | "HARD_DISABLED" | "UNSUPPORTED";

export type OAuthTokenSet = Readonly<{
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: readonly string[];
}>;

export type DiscoveredConnectionDestination = Readonly<{
  platformUserId: string;
  label: string;
  accountLabel?: string | null;
  destinationType: DestinationType;
  eligible: boolean;
  eligibilityReason?: string | null;
  accessToken?: string;
  refreshToken?: string | null;
}>;

export type ConnectionHttpClient = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type ConnectionProviderAdapter = Readonly<{
  platform: PublishingPlatform;
  capabilities: PlatformCapabilities;
  requiredScopes: readonly string[];
  supportsPkce: boolean;
  hardDisabled?: boolean;
  authorizationUrl(input: { clientId: string; redirectUri: string; state: string; codeChallenge?: string }): URL;
  exchangeCallback(input: { clientId: string; clientSecret: string; code: string; redirectUri: string; codeVerifier?: string; http?: ConnectionHttpClient }): Promise<OAuthTokenSet>;
  refresh(input: { clientId: string; clientSecret: string; refreshToken: string; http?: ConnectionHttpClient }): Promise<OAuthTokenSet>;
  revoke(input: { clientId: string; clientSecret: string; accessToken: string; http?: ConnectionHttpClient }): Promise<void>;
  discoverDestinations(input: { token: OAuthTokenSet; http?: ConnectionHttpClient }): Promise<readonly DiscoveredConnectionDestination[]>;
  verifyEligibility(input: { token: OAuthTokenSet; destination: DiscoveredConnectionDestination; http?: ConnectionHttpClient }): Promise<DiscoveredConnectionDestination>;
}>;

export type ConnectionDestination = Readonly<{
  externalId: string;
  platform: PublishingPlatform;
  destinationType: DestinationType;
  label: string;
  accountLabel: string | null;
  state: ConnectionState;
  scopes: readonly string[];
  providerDisabled: boolean;
}>;

export type ConnectionExchangeResult = Readonly<{
  state: Extract<ConnectionState, "CONNECTED" | "REAUTH_REQUIRED">;
  destinations: readonly ConnectionDestination[];
}>;

/** Provider-specific OAuth/account work stays behind this shared contract. */
export interface PublishingConnectionAdapter {
  readonly platform: PublishingPlatform;
  readonly capabilities: PlatformCapabilities;
  authorizationUrl(input: { state: string; redirectUri: string }): URL;
  exchangeCallback(input: { code: string; redirectUri: string }): Promise<ConnectionExchangeResult>;
  refresh(destinationExternalId: string): Promise<ConnectionDestination>;
  disconnect(destinationExternalId: string): Promise<{ disconnected: true }>;
  verifyEligibility(destinationExternalId: string): Promise<ConnectionDestination>;
  listDestinations(): Promise<readonly ConnectionDestination[]>;
}

export function toConnectionDestination(input: {
  externalId: string;
  platform: PublishingPlatform;
  destinationType: DestinationType;
  label: string;
  accountLabel?: string | null;
  status?: string;
  scopes?: readonly string[];
  providerDisabled?: boolean;
}): ConnectionDestination {
  const state: ConnectionState = input.status === "CONNECTED"
    ? "CONNECTED"
    : input.status === "REAUTH_REQUIRED"
      ? "REAUTH_REQUIRED"
      : input.status === "EXTERNAL_APPROVAL_REQUIRED"
        ? "EXTERNAL_APPROVAL_REQUIRED"
        : input.status === "HARD_DISABLED"
          ? "HARD_DISABLED"
      : input.status === "UNSUPPORTED"
        ? "UNSUPPORTED"
        : "NOT_CONNECTED";
  return {
    externalId: input.externalId,
    platform: input.platform,
    destinationType: input.destinationType,
    label: input.label,
    accountLabel: input.accountLabel ?? null,
    state,
    scopes: [...(input.scopes ?? [])],
    providerDisabled: input.providerDisabled ?? true,
  };
}

