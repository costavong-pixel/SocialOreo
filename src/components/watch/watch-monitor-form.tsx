"use client";

import { useState, useTransition, type FormEvent } from "react";

import { m2ConfigureWatch, m2PauseWatch } from "@/app/m2-actions";
import type { WatchMonitorView } from "@/lib/socialolla/watch/scheduled-watch";

export function WatchMonitorForm({
  cost,
  providerDisabled,
  monitors,
}: {
  cost: number;
  providerDisabled: boolean;
  monitors: WatchMonitorView[];
}) {
  const [profileUrl, setProfileUrl] = useState("");
  const [cadenceHours, setCadenceHours] = useState("168");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!confirmed) {
      setMessage("Confirm that you want scheduled public-profile captures before continuing.");
      return;
    }
    startTransition(async () => {
      try {
        const monitor = await m2ConfigureWatch({ profileUrl, platform: "instagram", cadenceHours: Number(cadenceHours), confirmed: true });
        setMessage(`Tracking enabled for ${monitor.profileUrl}. The next capture is scheduled automatically.`);
        setProfileUrl("");
        setConfirmed(false);
        window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not configure Watch.");
      }
    });
  }

  function pause(profile: string) {
    startTransition(async () => {
      try {
        await m2PauseWatch(profile);
        setMessage(`Tracking paused for ${profile}.`);
        window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not pause Watch.");
      }
    });
  }

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="font-display text-lg font-extrabold">Scheduled monitoring</h2>
      <p className="mt-1 text-sm text-white/60">Instagram profile captures use {cost} credit{cost === 1 ? "" : "s"} each. {providerDisabled ? "Live captures are unavailable in this staging environment; no social provider will be contacted." : "Captures use the configured staging provider."}</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
        <label className="block text-sm font-bold">Instagram profile URL<input value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} placeholder="https://www.instagram.com/creator/" className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-normal text-white" disabled={isPending} /></label>
        <label className="block text-sm font-bold">Cadence<select value={cadenceHours} onChange={(event) => setCadenceHours(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-normal text-white" disabled={isPending}><option value="168">Weekly</option><option value="336">Fortnightly</option></select></label>
        <button type="submit" disabled={isPending || !profileUrl.trim()} className="rounded-full bg-[var(--social-blue)] px-5 py-3 text-sm font-extrabold text-[var(--social-ink)] disabled:opacity-50">{isPending ? "Saving…" : "Start tracking"}</button>
        <label className="flex items-start gap-2 text-xs font-normal text-white/60 md:col-span-3"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={isPending} className="mt-0.5" />I understand that each scheduled capture consumes the displayed credits and produces a saved report.</label>
      </form>
      {message ? <p role="status" className="mt-3 text-sm text-white/70">{message}</p> : null}
      {monitors.length ? <div className="mt-5 space-y-2">{monitors.map((monitor) => <div key={`${monitor.platform}:${monitor.profileUrl}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 p-3"><div><p className="font-bold">{monitor.profileUrl}</p><p className="text-xs text-white/55">{monitor.platform} · {monitor.cadenceHours === 336 ? "Fortnightly" : "Weekly"} · {monitor.reportCount} capture{monitor.reportCount === 1 ? "" : "s"}{monitor.lastError ? ` · ${monitor.lastError}` : ""}</p></div>{monitor.enabled ? <button type="button" onClick={() => pause(monitor.profileUrl)} disabled={isPending} className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-white/70 disabled:opacity-50">Pause</button> : <span className="text-xs font-bold text-white/45">Paused</span>}</div>)}</div> : null}
    </div>
  );
}
