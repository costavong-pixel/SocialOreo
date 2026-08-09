import { planConfig } from "@/lib/socialolla/plans/plan-config";

export type SquareEnv = "sandbox" | "production";

export type SquareConfig = {
  /** Environment selector: 'sandbox' (default gate) or 'production'. */
  environment: SquareEnv;
  applicationId: string;
  /** Merchant/test-account identity returned by the Locations API. */
  expectedMerchantId: string;
  accessToken: string;
  locationId: string;
  currency: string;
  webhookSignatureKey: string;
  webhookNotificationUrl: string;
  appBaseUrl: string;
  lifetimeCatalogVariationId: string;
  monthlyPlanVariationId: string;
  monthlyPriceCents: number;
  singleAuditCatalogVariationId: string;
  creatorPackCatalogVariationId: string;
};

export type SquareConfigDiagnostics = {
  valid: boolean;
  invalidOrMissing: string[];
};

function value(name: string): string | null {
  const configured = process.env[name]?.trim();
  return configured || null;
}

/**
 * Explicit environment selector. Only 'sandbox' and 'production' are valid;
 * any other/missing value yields null so Square stays fail-closed.
 */
export function squareEnv(): SquareEnv | null {
  const configured = process.env.SQUARE_ENV?.trim();
  return configured === "sandbox" || configured === "production" ? configured : null;
}
function positiveCents(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;

  const cents = Number(value);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function httpsUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function currencyCode(value: string | null): string | null {
  const normalized = value?.toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

/**
 * Single authoritative monthly price. In production the Square payment price
 * must agree with the plan/UI price (both derive from SQUARE_MONTHLY_PRICE_CENTS)
 * and no divergent legacy override may be set; otherwise the configuration is
 * invalid and must fail closed. Sandbox is unaffected (legacy override ignored).
 */
function monthlyPriceAgrees(monthlyPriceCents: number | null, environment: SquareEnv | null): boolean {
  if (environment !== "production" || monthlyPriceCents === null) return true;
  const legacyOverride = Number(process.env.SOCIALOLLA_MONTHLY_PRICE_CENTS);
  const legacyDiverges = !Number.isNaN(legacyOverride) && legacyOverride !== monthlyPriceCents;
  return planConfig().monthly.priceCents === monthlyPriceCents && !legacyDiverges;
}

export function getSquareConfig(): SquareConfig | null {
  const environment = squareEnv();
  if (!environment) return null;

  const applicationId = value("SQUARE_APPLICATION_ID");
  const expectedMerchantId = value("SQUARE_EXPECTED_MERCHANT_ID");
  const accessToken = value("SQUARE_ACCESS_TOKEN");
  const locationId = value("SQUARE_LOCATION_ID");
  const currency = currencyCode(value("SQUARE_CURRENCY"));
  const webhookSignatureKey = value("SQUARE_WEBHOOK_SIGNATURE_KEY");
  const webhookNotificationUrl = httpsUrl(value("SQUARE_WEBHOOK_NOTIFICATION_URL"));
  const appBaseUrl = httpsUrl(value("APP_BASE_URL"));
  const lifetimeCatalogVariationId = value("SQUARE_CATALOG_VARIATION_LIFETIME");
  const monthlyPlanVariationId = value("SQUARE_SUBSCRIPTION_PLAN_VARIATION_MONTHLY");
  const monthlyPriceCents = positiveCents(value("SQUARE_MONTHLY_PRICE_CENTS"));
  const singleAuditCatalogVariationId = value("SQUARE_CATALOG_VARIATION_SINGLE_AUDIT");
  const creatorPackCatalogVariationId = value("SQUARE_CATALOG_VARIATION_CREATOR_PACK");

  if (
    !applicationId ||
    !expectedMerchantId ||
    !accessToken ||
    !locationId ||
    !currency ||
    !webhookSignatureKey ||
    !webhookNotificationUrl ||
    !appBaseUrl ||
    !lifetimeCatalogVariationId ||
    !monthlyPlanVariationId ||
    !monthlyPriceCents ||
    !singleAuditCatalogVariationId ||
    !creatorPackCatalogVariationId
  ) {
    return null;
  }

  if (!monthlyPriceAgrees(monthlyPriceCents, environment)) return null;

  return {
    environment,
    applicationId,
    expectedMerchantId,
    accessToken,
    locationId,
    currency,
    webhookSignatureKey,
    webhookNotificationUrl,
    appBaseUrl: appBaseUrl.replace(/\/$/, ""),
    lifetimeCatalogVariationId,
    monthlyPlanVariationId,
    monthlyPriceCents,
    singleAuditCatalogVariationId,
    creatorPackCatalogVariationId,
  };
}

/** Server-only, redacted configuration diagnosis. Never returns values. */
export function getSquareConfigDiagnostics(): SquareConfigDiagnostics {
  const invalidOrMissing: string[] = [];
  const required = (name: string) => {
    if (!value(name)) invalidOrMissing.push(name);
  };

  if (!squareEnv()) invalidOrMissing.push("SQUARE_ENV");
  required("SQUARE_ACCESS_TOKEN");
  required("SQUARE_APPLICATION_ID");
  required("SQUARE_EXPECTED_MERCHANT_ID");
  required("SQUARE_LOCATION_ID");
  required("SQUARE_WEBHOOK_SIGNATURE_KEY");
  required("SQUARE_CATALOG_VARIATION_LIFETIME");
  required("SQUARE_SUBSCRIPTION_PLAN_VARIATION_MONTHLY");
  required("SQUARE_CATALOG_VARIATION_SINGLE_AUDIT");
  required("SQUARE_CATALOG_VARIATION_CREATOR_PACK");

  if (!currencyCode(value("SQUARE_CURRENCY"))) invalidOrMissing.push("SQUARE_CURRENCY");
  if (!httpsUrl(value("SQUARE_WEBHOOK_NOTIFICATION_URL"))) invalidOrMissing.push("SQUARE_WEBHOOK_NOTIFICATION_URL");
  if (!httpsUrl(value("APP_BASE_URL"))) invalidOrMissing.push("APP_BASE_URL");
  const monthlyPriceCents = positiveCents(value("SQUARE_MONTHLY_PRICE_CENTS"));
  if (!monthlyPriceCents) {
    invalidOrMissing.push("SQUARE_MONTHLY_PRICE_CENTS");
  } else if (!monthlyPriceAgrees(monthlyPriceCents, squareEnv())) {
    invalidOrMissing.push("SQUARE_MONTHLY_PRICE_CENTS_MISMATCH");
  }

  return { valid: invalidOrMissing.length === 0, invalidOrMissing };
}
