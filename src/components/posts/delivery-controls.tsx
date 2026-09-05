"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { m2CancelPublishJob, m2ReschedulePublishJob } from "@/app/m2-actions";

export type DeliveryJobShape = {
  id: string;
  status: string;
  scheduledFor: Date | string | null;
  attemptCount: number;
};

function scheduledForUtc(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function DeliveryControls({ jobs }: { jobs: DeliveryJobShape[] }) {
  const router = useRouter();
  const [localDateTime, setLocalDateTime] = useState("");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  async function cancel(job: DeliveryJobShape) {
    setBusyJobId(job.id);
    setResult(null);
    try {
      const outcome = await m2CancelPublishJob(job.id);
      setResult(outcome.canceled ? "Scheduled delivery canceled." : "Delivery was no longer queued; refresh to see its current state.");
      router.refresh();
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Could not cancel delivery");
    } finally {
      setBusyJobId(null);
    }
  }

  async function reschedule(job: DeliveryJobShape) {
    const iso = scheduledForUtc(localDateTime);
    if (!iso) return;
    setBusyJobId(job.id);
    setResult(null);
    try {
      await m2ReschedulePublishJob({ jobId: job.id, scheduledFor: iso, timezone: "UTC" });
      setResult(job.status === "FAILED" ? "Failed delivery queued for retry." : "Canceled delivery rescheduled.");
      router.refresh();
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Could not reschedule delivery");
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--social-blue)]">Delivery controls</p>
      {jobs.map((job) => {
        const queued = job.status === "QUEUED";
        const retryable = job.status === "FAILED" || job.status === "CANCELED";
        if (!queued && !retryable) return null;
        return (
          <div className="grid gap-2 sm:flex sm:items-end sm:justify-between" key={job.id}>
            <div>
              <p className="text-sm font-bold">Instagram delivery · {job.status}</p>
              <p className="text-xs text-white/50">Worker attempts: {job.attemptCount}</p>
            </div>
            {queued ? (
              <button type="button" disabled={busyJobId !== null} onClick={() => cancel(job)} className="rounded-full border border-amber-300/40 px-4 py-2 text-sm font-extrabold text-amber-200 disabled:opacity-50">
                Cancel scheduled delivery
              </button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_auto] sm:items-end">
                <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`retry-at-${job.id}`}>
                  {job.status === "FAILED" ? "Retry at (UTC)" : "Reschedule at (UTC)"}
                  <input id={`retry-at-${job.id}`} type="datetime-local" value={localDateTime} onChange={(event) => setLocalDateTime(event.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
                </label>
                <button type="button" disabled={busyJobId !== null || !scheduledForUtc(localDateTime)} onClick={() => reschedule(job)} className="rounded-full border border-emerald-300/40 px-4 py-2 text-sm font-extrabold text-emerald-200 disabled:opacity-50">
                  {job.status === "FAILED" ? "Retry failed delivery" : "Reschedule canceled delivery"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {result ? <p role="status" className="text-sm text-white/70">{result}</p> : null}
    </div>
  );
}
