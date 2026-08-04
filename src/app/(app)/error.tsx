"use client";

import { shellStateLabel } from "@/lib/socialolla/shell/shell";

export default function M2AppError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="grid min-h-[40dvh] place-items-center">
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-5 text-center">
        <p className="font-display text-lg font-extrabold">{shellStateLabel("error")}</p>
        <p className="mt-1 text-sm text-white/60">You can retry, or check your connection and try again.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
