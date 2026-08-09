import type { SquareConfig } from "./config";
import { squareApiBaseUrl, squareApiVersion } from "./square-api";

type LocationResponse = { location?: { id?: string; merchant_id?: string } };

/**
 * Verifies that the configured location belongs to the expected merchant for
 * this Square environment (sandbox or production) before any hosted payment
 * link is created. No response body or identifiers are logged or returned to
 * callers.
 */
export async function verifySquareMerchantContext(config: SquareConfig): Promise<boolean> {
  if (!config.expectedMerchantId) return false;
  try {
    const response = await fetch(`${squareApiBaseUrl(config.environment)}/v2/locations/${encodeURIComponent(config.locationId)}`, {
      headers: { Authorization: `Bearer ${config.accessToken}`, "Square-Version": squareApiVersion() },
    });
    if (!response.ok) return false;
    const payload = (await response.json().catch(() => null)) as LocationResponse | null;
    const location = payload?.location;
    return location?.id === config.locationId && location.merchant_id === config.expectedMerchantId;
  } catch {
    return false;
  }
}
