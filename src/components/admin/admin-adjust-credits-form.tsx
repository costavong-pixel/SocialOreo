"use client";

import { useState } from "react";
import { m2AdminAdjust } from "@/app/m2-actions";

export function AdminAdjustCreditsForm() {
  const [targetUserId, setTargetUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function reset() {
    setConfirming(false);
    setResult(null);
  }

  async function submit() {
    setResult(null);
    try {
      const outcome = await m2AdminAdjust(targetUserId, Number(amount), reason);
      setResult({ ok: true, message: `Adjusted (${outcome.adjusted ? "applied" : "replayed"}). Reason recorded and audited.` });
      setConfirming(false);
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : "Adjustment failed" });
    }
  }

  return (
    <form
      className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirming) {
          setConfirming(true);
          setResult(null);
          return;
        }
        void submit();
      }}
    >
      <label className="block text-sm font-bold" htmlFor="target-user">Target user (auth sub)</label>
      <input id="target-user" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="auth0|..." className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white" required disabled={confirming} />
      <label className="block text-sm font-bold" htmlFor="amount">Amount</label>
      <input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 10" className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white" required disabled={confirming} />
      <label className="block text-sm font-bold" htmlFor="reason">Reason (required, audited)</label>
      <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. manual credit grant after support review" className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white" required disabled={confirming} />

      {confirming ? (
        <div className="rounded-2xl border border-[var(--social-blue)]/40 bg-[var(--social-blue)]/10 p-4">
          <p className="text-sm font-bold">Confirm adjustment</p>
          <p className="mt-1 text-sm text-white/75">
            {Number(amount) > 0 ? "Grant" : "Remove"} <strong>{Math.abs(Number(amount))}</strong> credit(s) to/from <strong>{targetUserId}</strong>. Reason: {reason}. This is audited.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">Confirm adjustment</button>
            <button type="button" onClick={reset} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white/70">Back</button>
          </div>
        </div>
      ) : (
        <button type="submit" className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">Review adjustment</button>
      )}

      {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>{result.message}</p>}
    </form>
  );
}
