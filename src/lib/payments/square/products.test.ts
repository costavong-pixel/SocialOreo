import { describe, expect, it } from "vitest";

import { getSquareProduct } from "./products";

const config = {
  applicationId: "app",
  accessToken: "token",
  locationId: "location",
  currency: "CAD",
  webhookSignatureKey: "signature",
  webhookNotificationUrl: "https://example.test/api/square/webhook",
  appBaseUrl: "https://example.test",
  lifetimeCatalogVariationId: "lifetime",
  monthlyPlanVariationId: "monthly",
  monthlyPriceCents: 2900,
  singleAuditCatalogVariationId: "single",
  creatorPackCatalogVariationId: "pack",
};

describe("Square products", () => {
  it("keeps Lifetime and Monthly as separate products", () => {
    expect(getSquareProduct(config, "lifetime")).toMatchObject({ ledgerProduct: "LIFETIME", kind: "one_time", credits: 0 });
    expect(getSquareProduct(config, "monthly")).toMatchObject({ ledgerProduct: "MONTHLY", kind: "subscription", credits: 0 });
  });

  it("maps additional audit credit products to approved quantities", () => {
    expect(getSquareProduct(config, "single_audit")).toMatchObject({ credits: 1, catalogVariationId: "single" });
    expect(getSquareProduct(config, "creator_pack")).toMatchObject({ credits: 10, catalogVariationId: "pack" });
  });
});
