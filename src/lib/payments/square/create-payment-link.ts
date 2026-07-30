import type { SquareConfig } from "./config";
import type { SquareProduct } from "./products";
import { verifySquareMerchantContext } from "./merchant-context";

const SQUARE_SANDBOX_API = "https://connect.squareupsandbox.com";
const SQUARE_API_VERSION = "2026-07-15";

type SquarePaymentLinkResponse = {
  payment_link?: {
    id?: string;
    order_id?: string;
    url?: string;
  };
};

export class SquareCheckoutError extends Error {
  constructor(message = "Square could not start checkout.") {
    super(message);
    this.name = "SquareCheckoutError";
  }
}

export async function createSquarePaymentLink(input: {
  checkoutId: string;
  idempotencyKey: string;
  config: SquareConfig;
  product: SquareProduct;
}): Promise<{ checkoutUrl: string; orderId: string; paymentLinkId: string }> {
  if (!(await verifySquareMerchantContext(input.config))) throw new SquareCheckoutError();
  const redirectUrl = `${input.config.appBaseUrl}/pricing?checkout=${encodeURIComponent(input.checkoutId)}`;
  // Square caps order.reference_id at 40 characters. A CUID plus this compact prefix
  // remains safely below that limit while preserving server-side checkout correlation.
  const checkoutReference = `so:${input.checkoutId}`;
  const body = input.product.kind === "subscription" ? {
    idempotency_key: input.idempotencyKey,
    quick_pay: {
      location_id: input.config.locationId,
      name: input.product.name,
      price_money: { amount: input.product.priceCents!, currency: input.config.currency },
    },
    checkout_options: {
      subscription_plan_id: input.product.catalogVariationId,
      redirect_url: redirectUrl,
    },
    description: "SocialOreo Monthly Sandbox subscription",
  } : {
    idempotency_key: input.idempotencyKey,
    order: {
      location_id: input.config.locationId,
      reference_id: checkoutReference,
      line_items: [{ catalog_object_id: input.product.catalogVariationId, quantity: "1" }],
    },
    checkout_options: { redirect_url: redirectUrl },
    payment_note: checkoutReference,
  };

  const response = await fetch(`${SQUARE_SANDBOX_API}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_API_VERSION,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as SquarePaymentLinkResponse | null;
  const checkoutUrl = payload?.payment_link?.url;
  const orderId = payload?.payment_link?.order_id;
  const paymentLinkId = payload?.payment_link?.id;

  if (!response.ok || !checkoutUrl || !orderId || !paymentLinkId) {
    throw new SquareCheckoutError();
  }

  return { checkoutUrl, orderId, paymentLinkId };
}
