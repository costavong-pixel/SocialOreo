"use client";

import { useState } from "react";
import { m2AdminSetLifetimePrice } from "@/app/m2-actions";

export function AdminSetLifetimePriceForm({ currentPriceCents }: { currentPriceCents: number }) {
  const [priceCents, setPriceCents] = useState(String(currentPriceCents));
  const [result, setResult] = useState<string | null>(null);

  return (
    <form
      className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = Number(priceCents);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          setResult("Price must be a positive whole number of cents.");
          return;
        }
        try {
          const plan = await m2AdminSetLifetimePrice(parsed);
          setResult(`Lifetime price updated to $${(plan.priceCents / 100).toFixed(2)} (audited).`);
        } catch (cause) {
          setResult(cause instanceof Error ? cause.message : "Failed to update price");
        }
      }}
    >
      <label className="block text-sm font-bold" htmlFor="price-cents">Lifetime price (cents)</label>
      <div className="flex items-end gap-3">
        <input
          id="price-cents"
          value={priceCents}
          onChange={(e) => setPriceCents(e.target.value)}
          inputMode="numeric"
          className="w-full max-w-[12rem] rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white"
        />
        <button type="submit" className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">
          Update price
        </button>
      </div>
      <p className="text-xs text-white/50">Applies to the sandbox pricing source (page + checkout share it). An ADMIN_SET_LIFETIME_PRICE audit event is recorded.</p>
      {result && <p role="status" className="text-sm text-white/70">{result}</p>}
    </form>
  );
}
