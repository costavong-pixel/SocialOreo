import type { SquareConfig } from "./config";

const SQUARE_SANDBOX_API = "https://connect.squareupsandbox.com";
const SQUARE_API_VERSION = "2026-07-15";

type LocationResponse = { location?: { id?: string; merchant_id?: string } };

/**
 * Verifies that the configured location belongs to the expected Sandbox
 * merchant before any hosted payment link is created. No response body or
 * identifiers are logged or returned to callers.
 */
export async function verifySquareMerchantContext(config: SquareConfig): Promise<boolean> {
  if (!config.expectedMerchantId) return false;
  try {
    const response = await fetch(`${SQUARE_SANDBOX_API}/v2/locations/${encodeURIComponent(config.locationId)}`, {
      headers: { Authorization: `Bearer ${config.accessToken}`, "Square-Version": SQUARE_API_VERSION },
    });
    if (!response.ok) return false;
    const payload = (await response.json().catch(() => null)) as LocationResponse | null;
    const location = payload?.location;
    return location?.id === config.locationId && location.merchant_id === config.expectedMerchantId;
  } catch {
    return false;
  }
}
