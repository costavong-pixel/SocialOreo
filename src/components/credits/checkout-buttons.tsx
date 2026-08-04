"use client";

import { useState } from "react";
import { m2EnsureMonthlyBatch } from "@/app/m2-actions";

type CheckoutKind = "lifetime" | "monthly";

type CheckoutResponse = {
  checkoutUrl?: string;
  error?: string;
};

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);
}

export function CheckoutButtons({ lifetimePriceCents, monthlyPriceCents }: { lifetimePriceCents: number; monthlyPriceCents: number }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<CheckoutKind | null>(null);

  async function openCheckout(kind: CheckoutKind) {
    setError(null);
    setBusy(kind);
    try {
      const url = kind === "monthly" ? "/api/square/monthly/checkout" : "/api/square/checkout";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "monthly" ? undefined : JSON.stringify({ product: "lifetime" }),
      });
      const payload = (await response.json().catch(() => null)) as CheckoutResponse | null;
      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.error ?? `Checkout request failed (${response.status}).`);
      }
      window.location.assign(payload.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not open checkout.");
    } finally {
      setBusy(null);
    }
  }

  const offers: { kind: CheckoutKind; title: string; price: string; detail: string }[] = [
    { kind: "lifetime", title: "Choose Lifetime", price: formatCents(lifetimePriceCents), detail: "One-time lifetime plan with included credits." },
    { kind: "monthly", title: "Choose Monthly", price: formatCents(monthlyPriceCents), detail: "Recurring plan with monthly included credits." },
  ];

  return (
    <section aria-label="Purchase credits or access" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="font-display text-lg font-extrabold">Purchase</h2>
      <p className="mt-1 text-xs text-white/50">
        Sandbox checkout only — Square-hosted, tester-gated, provider-disabled. No live payment is processed outside the configured sandbox merchant.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {offers.map((offer) => (
          <div key={offer.kind} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="font-bold">{offer.title}</p>
            <p className="mt-1 font-display text-2xl font-extrabold">{offer.price}</p>
            <p className="mt-1 text-sm text-white/60">{offer.detail}</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => openCheckout(offer.kind)}
              className="mt-3 w-full rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50"
            >
              {busy === offer.kind ? "Opening checkout…" : offer.title}
            </button>
          </div>
        ))}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}

export function ClaimMonthlyCredits({ entitled, includedMonthlyCredits }: { entitled: boolean; includedMonthlyCredits: number }) {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!entitled) return null;

  async function claim() {
    setBusy(true);
    setResult(null);
    try {
      const batch = await m2EnsureMonthlyBatch();
      setResult(batch ? `Monthly batch ${batch.id} is ready (${batch.remaining}/${batch.amount} credits remaining).` : "No monthly entitlement to claim.");
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Could not claim monthly credits");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-sm font-bold">Monthly credits</p>
      <p className="mt-1 text-xs text-white/60">Your entitlement includes {includedMonthlyCredits} credit(s) this period.</p>
      <button type="button" disabled={busy} onClick={claim} className="mt-3 rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">
        Claim monthly credits
      </button>
      {result ? <p role="status" className="mt-2 text-sm text-white/70">{result}</p> : null}
    </div>
  );
}
