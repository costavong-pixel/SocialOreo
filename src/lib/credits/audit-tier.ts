export const FREE_AUDIT_REEL_LIMIT = 7;
export const PAID_AUDIT_REEL_LIMIT = 30;
export const PAID_AUDIT_CREDIT_COST = 1;

export type RequestedTier = "free" | "paid";

export type AuditTier =
  | {
      tier: "free";
      reelLimit: number;
      creditCost: 0;
    }
  | {
      tier: "paid";
      reelLimit: number;
      creditCost: typeof PAID_AUDIT_CREDIT_COST;
    };

export function resolveAuditTier(requestedTier?: RequestedTier): AuditTier {
  const tier = requestedTier ?? "free";

  if (tier === "paid") {
    return {
      tier: "paid",
      reelLimit: PAID_AUDIT_REEL_LIMIT,
      creditCost: PAID_AUDIT_CREDIT_COST,
    };
  }

  return {
    tier: "free",
    reelLimit: FREE_AUDIT_REEL_LIMIT,
    creditCost: 0,
  };
}
