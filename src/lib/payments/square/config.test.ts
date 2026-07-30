import { afterEach, describe, expect, it } from "vitest";

import { getSquareConfig, getSquareConfigDiagnostics } from "./config";

const originalEnv = { ...process.env };

function configureSandbox() {
    process.env.SQUARE_ENV = "sandbox";
    process.env.SQUARE_APPLICATION_ID = "sandbox-app-id";
    process.env.SQUARE_EXPECTED_MERCHANT_ID = "sandbox-merchant-id";
  process.env.SQUARE_ACCESS_TOKEN = "sandbox-token";
  process.env.SQUARE_LOCATION_ID = "sandbox-location";
  process.env.SQUARE_CURRENCY = "cad";
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "signature-key";
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = "https://example.test/api/square/webhook";
  process.env.APP_BASE_URL = "https://example.test";
  process.env.SQUARE_CATALOG_VARIATION_LIFETIME = "lifetime-variation";
  process.env.SQUARE_SUBSCRIPTION_PLAN_VARIATION_MONTHLY = "monthly-plan-variation";
  process.env.SQUARE_MONTHLY_PRICE_CENTS = "1900";
  process.env.SQUARE_CATALOG_VARIATION_SINGLE_AUDIT = "single-audit-variation";
  process.env.SQUARE_CATALOG_VARIATION_CREATOR_PACK = "creator-pack-variation";
}

describe("Square sandbox config", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is disabled until every sandbox-only value is configured", () => {
    delete process.env.SQUARE_ACCESS_TOKEN;
    expect(getSquareConfig()).toBeNull();
  });

  it("accepts a complete sandbox-only configuration", () => {
    configureSandbox();

    expect(getSquareConfig()).toMatchObject({
      locationId: "sandbox-location",
      currency: "CAD",
      monthlyPlanVariationId: "monthly-plan-variation",
      applicationId: "sandbox-app-id",
      monthlyPriceCents: 1900,
    });
  });

  it("rejects a live environment even when values are present", () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";

    expect(getSquareConfig()).toBeNull();
  });

  it("rejects an unexpected Monthly price", () => {
    configureSandbox();
    process.env.SQUARE_MONTHLY_PRICE_CENTS = "2000";

    expect(getSquareConfig()).toBeNull();
  });

  it("reports only invalid configuration names", () => {
    configureSandbox();
    process.env.SQUARE_MONTHLY_PRICE_CENTS = "2000";
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = "http://insecure.example/webhook";

    expect(getSquareConfigDiagnostics()).toEqual({
      valid: false,
      invalidOrMissing: ["SQUARE_WEBHOOK_NOTIFICATION_URL", "SQUARE_MONTHLY_PRICE_CENTS"],
    });
  });
});
