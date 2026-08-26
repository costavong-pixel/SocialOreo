export type DestinationView = {
  externalId: string;
  label: string;
  platform: string;
  status: string;
  providerDisabled: boolean;
};

/**
 * Explicit server-to-client DTO for destination selectors. Provider identity,
 * OAuth token material, scopes, and expiry metadata must stay server-side.
 */
export function toDestinationView(
  destination: DestinationView,
): DestinationView {
  return {
    externalId: destination.externalId,
    label: destination.label,
    platform: destination.platform,
    status: destination.status,
    providerDisabled: destination.providerDisabled,
  };
}
