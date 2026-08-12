import { NextResponse } from "next/server";
import { z } from "zod";

import { getSquareConfig } from "@/lib/payments/square/config";
import { recordSquareSubscription, settleSquareCheckout, settleSquareRefund, settleSquareRenewal, withSquareWebhookClaim } from "@/lib/payments/square/checkout-service";
import { verifySquareWebhookSignature } from "@/lib/payments/square/verify-webhook-signature";

const moneySchema = z.object({ amount: z.number(), currency: z.string() }).optional();

const paymentSchema = z.object({
  id: z.string().min(1),
  order_id: z.string().min(1),
  customer_id: z.string().min(1).nullable().optional(),
  location_id: z.string().min(1),
  status: z.string(),
  amount_money: moneySchema,
  total_money: moneySchema,
});

const subscriptionSchema = z.object({
  id: z.string().min(1),
  customer_id: z.string().min(1),
  location_id: z.string().min(1),
  plan_variation_id: z.string().min(1),
  status: z.string().min(1),
  canceled_date: z.string().date().nullable().optional(),
});

const refundSchema = z.object({
  id: z.string().min(1),
  payment_id: z.string().min(1),
  order_id: z.string().min(1).nullable().optional(),
  location_id: z.string().min(1),
  status: z.string().min(1),
  unlinked: z.boolean().optional(),
  amount_money: z.object({ amount: z.number().int(), currency: z.string().min(1) }),
});

class SquareWebhookRetryableError extends Error {
  constructor() {
    super("Square webhook should be retried.");
    this.name = "SquareWebhookRetryableError";
  }
}

export async function POST(request: Request) {
  const config = getSquareConfig();
  if (!config) return NextResponse.json({ error: "Checkout is not configured yet." }, { status: 503 });

  const rawBody = await request.text();
  const verification = verifySquareWebhookSignature(
    rawBody,
    request.headers.get("x-square-hmacsha256-signature"),
    config.webhookSignatureKey,
    config.webhookNotificationUrl,
  );
  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.reason === "missing_signature" ? "Missing Square signature." : "Invalid Square signature." },
      { status: verification.reason === "missing_signature" ? 400 : 401 },
    );
  }

  const parsedJson = await new Response(rawBody).json().catch(() => null);
  const event = z.object({
    event_id: z.string().min(1),
    merchant_id: z.string().min(1).optional(),
    type: z.string(),
    created_at: z.string().datetime().optional(),
    data: z.object({ object: z.record(z.string(), z.unknown()).optional() }).optional(),
  }).safeParse(parsedJson);
  if (!event.success) return NextResponse.json({ error: "Invalid Square event." }, { status: 400 });

  let result;
  try {
    result = await withSquareWebhookClaim({ eventId: event.data.event_id, eventType: event.data.type, rawBody }, async () => {
    const object = event.data.data?.object;
    if (event.data.type === "payment.updated") {
      const payment = paymentSchema.safeParse(object?.payment);
      if (!payment.success || payment.data.status !== "COMPLETED" || payment.data.location_id !== config.locationId) {
        return { ignored: true };
      }

      const paymentMoney = payment.data.total_money ?? payment.data.amount_money;
      const result = await settleSquareCheckout({
        orderId: payment.data.order_id,
        paymentId: payment.data.id,
        customerId: payment.data.customer_id ?? null,
        monthlyPlanVariationId: config.monthlyPlanVariationId,
        priceCents: config.monthlyPriceCents,
        ...(paymentMoney ? { amountCents: paymentMoney.amount, currency: paymentMoney.currency } : {}),
      });
      if (result.status === "unknown") {
        // A COMPLETED payment with no server-created order is a recurring MONTHLY
        // renewal auto-charge. Reconcile it (amount must equal the monthly price).
        const renewal = await settleSquareRenewal({
          orderId: payment.data.order_id,
          paymentId: payment.data.id,
          customerId: payment.data.customer_id ?? "",
          monthlyPlanVariationId: config.monthlyPlanVariationId,
          amountCents: payment.data.total_money?.amount ?? payment.data.amount_money?.amount ?? 0,
          currency: payment.data.total_money?.currency ?? payment.data.amount_money?.currency ?? null,
          config,
        });
        return {
          creditsGranted: renewal.creditsGranted,
          duplicate: renewal.status === "duplicate",
          ignored: renewal.status === "unknown",
        };
      }
      return {
        creditsGranted: result.creditsGranted,
        duplicate: result.status === "duplicate",
        ignored: false,
      };
    }

    if (event.data.type === "refund.created" || event.data.type === "refund.updated") {
      const refund = refundSchema.safeParse(object?.refund);
      const merchantId = event.data.merchant_id;
      if (
        !refund.success ||
        merchantId !== config.expectedMerchantId ||
        refund.data.status !== "COMPLETED" ||
        refund.data.unlinked === true ||
        refund.data.location_id !== config.locationId ||
        refund.data.amount_money.currency !== config.currency
      ) {
        return { ignored: true };
      }

      const result = await settleSquareRefund({
        refundId: refund.data.id,
        paymentId: refund.data.payment_id,
        refundOrderId: refund.data.order_id ?? null,
        locationId: refund.data.location_id,
        merchantId,
        status: refund.data.status,
        amountCents: refund.data.amount_money.amount,
        currency: refund.data.amount_money.currency,
        config,
      });
      if (result.status === "retry") throw new SquareWebhookRetryableError();
      return {
        creditsReversed: result.creditsReversed,
        duplicate: result.status === "duplicate",
        ignored: result.status === "ignored",
      };
    }

    if (event.data.type === "subscription.created" || event.data.type === "subscription.updated") {
      const subscription = subscriptionSchema.safeParse(object?.subscription);
      if (
        !subscription.success ||
        subscription.data.location_id !== config.locationId ||
        subscription.data.plan_variation_id !== config.monthlyPlanVariationId
      ) {
        return { ignored: true };
      }

      await recordSquareSubscription({
        subscriptionId: subscription.data.id,
        customerId: subscription.data.customer_id,
        planVariationId: subscription.data.plan_variation_id,
        status: subscription.data.status,
        canceledDate: subscription.data.canceled_date ?? null,
        source: "WEBHOOK",
        eventType: event.data.type,
        eventCreatedAt: event.data.created_at ?? null,
      });
    }

    return { ignored: event.data.type !== "subscription.created" && event.data.type !== "subscription.updated" };
    });
  } catch (error) {
    if (error instanceof SquareWebhookRetryableError) {
      return NextResponse.json({ error: "Square webhook will be retried." }, { status: 503 });
    }
    throw error;
  }

  if (result.state === "completed") return NextResponse.json({ received: true, duplicate: true });
  if (result.state === "processing") return NextResponse.json({ error: "Square webhook is already processing." }, { status: 503 });
  return NextResponse.json({ received: true, ...result.value });
}
