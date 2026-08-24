"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { m2SchedulePost } from "@/app/m2-actions";

const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export type DestinationShape = { externalId: string; label: string; platform: string; status: string; providerDisabled: boolean };
export type OccurrenceShape = { id: string; status: string; scheduleAt: Date | string | null; timezone: string; destinationRef: string };
export type SlotShape = { id: string; destinationRef: string; scheduleAt: Date | string; timezone: string; createdAt: Date | string };

function zonedToUtc(dateStr: string, timeZone: string): Date {
  const [datePart, timePart] = dateStr.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart ?? "00:00").split(":").map(Number);
  const provisional = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(provisional)).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return new Date(provisional - (asUTC - provisional));
}

function slotDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function ScheduleControl({
  postExternalId,
  destinationRef,
  destinations,
  occurrences,
  slots,
  providerDisabled = true,
}: {
  postExternalId: string;
  destinationRef: string;
  destinations: DestinationShape[];
  occurrences: OccurrenceShape[];
  slots: SlotShape[];
  providerDisabled?: boolean;
}) {
  const router = useRouter();
  const [localDateTime, setLocalDateTime] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destination = destinations.find((d) => d.externalId === destinationRef);

  const utcPreview = useMemo(() => {
    if (!localDateTime) return null;
    try {
      const date = zonedToUtc(localDateTime, timezone);
      if (Number.isNaN(date.getTime())) return null;
      return {
        iso: date.toISOString(),
        wallTime: new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(date),
      };
    } catch {
      return null;
    }
  }, [localDateTime, timezone]);

  async function schedule() {
    if (!utcPreview) return;
    setBusy(true);
    setResult(null);
    try {
      const outcome = await m2SchedulePost({ postRequestExternalId: postExternalId, scheduleAt: utcPreview.iso, timezone });
      setResult(`Post scheduled (${outcome.status}). Durable schedule persisted; live delivery is not enabled in staging.`);
      router.refresh();
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Could not schedule post");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--social-blue)]">Approve &amp; schedule</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`schedule-at-${postExternalId}`}>
          Schedule for (local time)
          <input id={`schedule-at-${postExternalId}`} type="datetime-local" value={localDateTime} onChange={(e) => setLocalDateTime(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
        </label>
        <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`timezone-${postExternalId}`}>
          Timezone
          <select id={`timezone-${postExternalId}`} value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
        <p className="font-bold text-white/80">Preview</p>
        <p>Destination: {destination?.label ?? "Connected account"} ({destination?.platform ?? "—"} · {destination?.status ?? "not connected"})</p>
        <p>Live delivery: {providerDisabled ? "not enabled in staging" : "not configured"}</p>
        <p>{utcPreview ? <>Local wall time {utcPreview.wallTime} → stored UTC <code>{utcPreview.iso}</code></> : "Pick a date and timezone to see the UTC conversion."}</p>
        <p className="text-white/40">Scheduling requires an approved final variant. No credit is charged by scheduling.</p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !utcPreview} onClick={schedule} className="rounded-full bg-[var(--social-blue)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">
          Approve &amp; schedule
        </button>
        {result ? <p role="status" className="text-sm text-white/70">{result}</p> : null}
      </div>

      {slots.length > 0 ? (
        <div className="border-t border-white/10 pt-2">
          <p className="text-xs font-bold text-white/50">Scheduled slots:</p>
          {slots.map((slot) => {
            const occurrence = occurrences.find((o) => slotDate(slot.scheduleAt).getTime() === (o.scheduleAt ? slotDate(o.scheduleAt).getTime() : -1));
            const status = occurrence?.status ?? "SCHEDULED";
            return (
              <p key={slot.id} className="mt-1 text-xs text-white/60">
                {slotDate(slot.scheduleAt).toISOString()} · {slot.timezone} · status <strong>{status}</strong> · durable schedule persisted
              </p>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-white/50">No scheduled slots for this post yet.</p>
      )}
    </div>
  );
}
