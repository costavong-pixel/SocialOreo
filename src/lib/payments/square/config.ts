export type SquareConfig = {
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

function value(name: string): string | null {
  const configured = process.env[name]?.trim();
  return configured || null;
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

export function getSquareConfig(): SquareConfig | null {
  if (process.env.SQUARE_ENV !== "sandbox") return null;

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
    !creatorPackCatalogVariationId ||
    monthlyPriceCents !== 1900
  ) {
    return null;
  }

  return {
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
