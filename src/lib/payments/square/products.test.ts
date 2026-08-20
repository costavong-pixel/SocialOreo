import { describe, expect, it } from "vitest";

import { getSquareProduct } from "./products";
import type { SquareConfig } from "./config";

const config: SquareConfig = {
  environment: "sandbox",
  applicationId: "app",
  expectedMerchantId: "merchant",
  accessToken: "token",
  locationId: "location",
  currency: "CAD",
  webhookSignatureKey: "signature",
  webhookNotificationUrl: "https://example.test/api/square/webhook",
  appBaseUrl: "https://example.test",
  lifetimeCatalogVariationId: "lifetime",
  monthlyPlanId: "monthly-plan",
  monthlyPlanVariationId: "monthly",
  monthlyPriceCents: 2900,
  lifetimePriceCents: 7900,
  singleAuditPriceCents: 1100,
  creatorPackPriceCents: 9500,
  singleAuditCatalogVariationId: "single",
  creatorPackCatalogVariationId: "pack",
};

describe("Square products", () => {
  it("keeps Lifetime and Monthly as separate products", () => {
    expect(getSquareProduct(config, "lifetime")).toMatchObject({ ledgerProduct: "LIFETIME", kind: "one_time", credits: 0, priceCents: 7900 });
    expect(getSquareProduct(config, "monthly")).toMatchObject({ ledgerProduct: "MONTHLY", kind: "subscription", credits: 0, priceCents: 2900 });
  });

  it("maps additional audit credit products to approved quantities", () => {
    expect(getSquareProduct(config, "single_audit")).toMatchObject({ credits: 1, catalogVariationId: "single", priceCents: 1100 });
    expect(getSquareProduct(config, "creator_pack")).toMatchObject({ credits: 10, catalogVariationId: "pack", priceCents: 9500 });
  });
});
