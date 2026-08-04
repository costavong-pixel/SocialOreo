"use client";

import { useState } from "react";
import { m2CreditsOverview } from "@/app/m2-actions";

type CheckoutResponse = {
  checkoutUrl?: string;
  error?: string;
};

export function LifetimeCheckoutButton() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function openCheckout() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/square/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: "lifetime" }),
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const payload = isJson ? (await response.json().catch(() => null)) as CheckoutResponse | null : null;
      if (!response.ok || !payload?.checkoutUrl) {
        setNotice(null);
        throw new Error(payload?.error ?? `Checkout request failed (${response.status}).`);
      }
      setNotice("Opening Square sandbox checkout…");
      window.location.assign(payload.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "We could not open checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={loading}
        onClick={openCheckout}
        className="block w-full rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-60"
      >
        {loading ? "Opening checkout…" : "Choose Lifetime"}
      </button>
      <p className="mt-2 text-xs text-white/50">Checkout is Square sandbox-only and tester-gated. Entitlement is granted exactly once after settlement.</p>
      {notice && <p role="status" className="mt-2 text-sm text-white/70">{notice}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
