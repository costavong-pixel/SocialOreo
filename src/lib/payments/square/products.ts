import type { SquareConfig } from "./config";

export const squareProductIds = ["lifetime", "monthly", "single_audit", "creator_pack"] as const;
export const oneTimeSquareProductIds = ["lifetime", "single_audit", "creator_pack"] as const;

export type SquareProductId = (typeof squareProductIds)[number];

export type SquareProduct = {
  id: SquareProductId;
  ledgerProduct: "LIFETIME" | "MONTHLY" | "SINGLE_AUDIT" | "CREATOR_PACK";
  name: string;
  kind: "one_time" | "subscription";
  credits: number;
  catalogVariationId: string;
  priceCents?: number;
};

export function getSquareProduct(config: SquareConfig, id: SquareProductId): SquareProduct {
  switch (id) {
    case "lifetime":
      return { id, ledgerProduct: "LIFETIME", name: "SocialOreo Lifetime", kind: "one_time", credits: 0, catalogVariationId: config.lifetimeCatalogVariationId };
    case "monthly":
      return { id, ledgerProduct: "MONTHLY", name: "SocialOreo Monthly", kind: "subscription", credits: 0, catalogVariationId: config.monthlyPlanVariationId, priceCents: config.monthlyPriceCents };
    case "single_audit":
      return { id, ledgerProduct: "SINGLE_AUDIT", name: "1 full audit credit", kind: "one_time", credits: 1, catalogVariationId: config.singleAuditCatalogVariationId };
    case "creator_pack":
      return { id, ledgerProduct: "CREATOR_PACK", name: "10 full audit credits", kind: "one_time", credits: 10, catalogVariationId: config.creatorPackCatalogVariationId };
  }
}
