import type { DestinationType, PlatformCapabilities, PublishingPlatform } from "@/lib/socialolla/publishing/platform-adaptation";

export type ConnectionState = "NOT_CONNECTED" | "CONNECTED" | "REAUTH_REQUIRED" | "UNSUPPORTED";

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

