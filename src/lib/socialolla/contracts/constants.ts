export const EXTERNAL_ID_PREFIX = {
  workspace: "wsp_",
  destination: "dst_",
  profile: "prf_",
  postRequest: "req_",
  creditBatch: "cbt_",
  auditEvent: "evt_",
  entitlementSnapshot: "ent_",
  planVersion: "plv_",
} as const;

export const IDEMPOTENCY_KEY_NAMESPACE = "so";
export const IDEMPOTENCY_KEY_PATTERN = /^so:[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)*$/;

export const DEFAULT_LOCALE = "en-US";
export const DEFAULT_LANGUAGE = "en";

export const POST_STATUS = [
  "pending",
  "generating",
  "review",
  "approved",
  "scheduled",
  "delivered",
  "cancelled",
  "failed",
] as const;
