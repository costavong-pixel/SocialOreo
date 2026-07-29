"use client";

import { useEffect, useState } from "react";

type SquareProductId = "lifetime" | "monthly" | "single_audit" | "creator_pack";

type CheckoutResponse = {
  checkoutUrl?: string;
  error?: string;
};

const offers: Array<{
  product: SquareProductId;
  title: string;
  detail: string;
}> = [
  { product: "lifetime", title: "Lifetime Competitor Board", detail: "One saved competitor plus separately purchased audit credits." },
  { product: "single_audit", title: "1 full audit credit", detail: "One 30-post audit." },
  { product: "creator_pack", title: "10 full audit credits", detail: "Credits for additional 30-post audits." },
];

export function PurchaseButtons() {
  const [error, setError] = useState<string | null>(null);
  const [loadingProduct, setLoadingProduct] = useState<SquareProductId | null>(null);
  const [monthlyAvailable, setMonthlyAvailable] = useState(false);

  useEffect(() => {
    void fetch("/api/square/monthly/availability").then((response) => {
      if (response.ok) setMonthlyAvailable(true);
    }).catch(() => undefined);
  }, []);

  async function openCheckout(product: SquareProductId) {
    setError(null);
    setLoadingProduct(product);

    try {
      const response = await fetch(product === "monthly" ? "/api/square/monthly/checkout" : "/api/square/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(product === "monthly" ? {} : { body: JSON.stringify({ product }) }),
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const payload = isJson ? (await response.json().catch(() => null)) as CheckoutResponse | null : null;
      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.error ?? `Checkout request failed (${response.status}).`);
      }

      window.location.assign(payload.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "We could not open checkout.");
      setLoadingProduct(null);
    }
  }

  return (
    <section aria-label="Purchase SocialOreo access or credits" className="mt-4 border-t border-black/10 pt-4">
      <p className="text-sm font-bold">Need competitor access or additional audit credits?</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[...offers, ...(monthlyAvailable ? [{ product: "monthly" as const, title: "Monthly Competitor Board", detail: "Up to three saved competitors while the subscription is active." }] : [])].map((offer) => (
          <div className="border border-black/10 p-4" key={offer.product}>
            <p className="font-bold">{offer.title}</p>
            <p className="mt-1 text-sm text-black/65">{offer.detail}</p>
            <button
              className="mt-3 w-full bg-black px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              disabled={loadingProduct !== null}
              onClick={() => openCheckout(offer.product)}
              type="button"
            >
              {loadingProduct === offer.product ? "Opening checkout..." : `Choose ${offer.title}`}
            </button>
          </div>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
