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

describe("Square environment-mode config", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is disabled until every required value is configured", () => {
    configureSandbox();
    delete process.env.SQUARE_ACCESS_TOKEN;
    expect(getSquareConfig()).toBeNull();
  });

  it("is disabled when SQUARE_ENV is missing or unknown (fail closed)", () => {
    configureSandbox();
    delete process.env.SQUARE_ENV;
    expect(getSquareConfig()).toBeNull();

    configureSandbox();
    process.env.SQUARE_ENV = "staging";
    expect(getSquareConfig()).toBeNull();
  });

  it("accepts a complete sandbox-only configuration", () => {
    configureSandbox();

    expect(getSquareConfig()).toMatchObject({
      environment: "sandbox",
      locationId: "sandbox-location",
      currency: "CAD",
      monthlyPlanVariationId: "monthly-plan-variation",
      applicationId: "sandbox-app-id",
      monthlyPriceCents: 1900,
    });
  });

  it("accepts a complete production configuration (explicit production mode)", () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";

    expect(getSquareConfig()).toMatchObject({
      environment: "production",
      locationId: "sandbox-location",
      applicationId: "sandbox-app-id",
      monthlyPriceCents: 1900,
    });
  });

  it("accepts any positive monthly price and rejects zero, negative or non-numeric", () => {
    configureSandbox();
    process.env.SQUARE_MONTHLY_PRICE_CENTS = "2000";
    expect(getSquareConfig()?.monthlyPriceCents).toBe(2000);

    for (const bad of ["0", "-100", "not-a-number"]) {
      configureSandbox();
      process.env.SQUARE_MONTHLY_PRICE_CENTS = bad;
      expect(getSquareConfig()).toBeNull();
    }
  });

  it("fails closed in production when a required value is missing", () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";
    delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    expect(getSquareConfig()).toBeNull();
  });

  it("reports only invalid configuration names", () => {
    configureSandbox();
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = "http://insecure.example/webhook";

    expect(getSquareConfigDiagnostics()).toEqual({
      valid: false,
      invalidOrMissing: ["SQUARE_WEBHOOK_NOTIFICATION_URL"],
    });
  });

  it("flags production invalid when the legacy monthly price override disagrees", () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";
    process.env.SOCIALOLLA_MONTHLY_PRICE_CENTS = "2100";

    expect(getSquareConfigDiagnostics()).toEqual({
      valid: false,
      invalidOrMissing: ["SQUARE_MONTHLY_PRICE_CENTS_MISMATCH"],
    });
  });

  it("fails closed (config null) in production when the monthly price disagrees", () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";
    process.env.SOCIALOLLA_MONTHLY_PRICE_CENTS = "2100";

    expect(getSquareConfig()).toBeNull();
  });

  it("accepts a production config when the price sources agree", () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";
    delete process.env.SOCIALOLLA_MONTHLY_PRICE_CENTS;

    expect(getSquareConfig()).toMatchObject({ environment: "production", monthlyPriceCents: 1900 });
  });

  it("reports a valid production configuration when price sources agree", () => {
    configureSandbox();
    process.env.SQUARE_ENV = "production";
    delete process.env.SOCIALOLLA_MONTHLY_PRICE_CENTS;

    expect(getSquareConfigDiagnostics().valid).toBe(true);
    expect(getSquareConfigDiagnostics().invalidOrMissing).toEqual([]);
  });
});
