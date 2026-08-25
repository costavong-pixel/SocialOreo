import { createHash } from "node:crypto";

/**
 * A support-safe account reference. It is deliberately derived from a stable
 * server-side identity and is never accepted as an authentication credential.
 */
export function accountSupportReference(stableIdentity: string): string {
  return createHash("sha256")
    .update(`socialolla:account-reference:v1:${stableIdentity}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
}
