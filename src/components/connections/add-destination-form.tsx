"use client";

import { useState } from "react";
import { m2AddDestination, m2CreatePost, m2RunWatch, m2FirstPostAndPlan } from "@/app/m2-actions";

export function AddDestinationForm() {
  const [platform, setPlatform] = useState("instagram");
  const [accountLabel, setAccountLabel] = useState("");
  const [result, setResult] = useState<string | null>(null);

  return (
    <form
      className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          const created = await m2AddDestination(platform, accountLabel);
          setResult(`Added ${accountLabel} (${created.providerDisabled ? "provider-disabled" : ""}).`);
        } catch (cause) {
          setResult(cause instanceof Error ? cause.message : "Failed to add destination");
        }
      }}
    >
      <label className="block text-sm font-bold" htmlFor="platform">Platform</label>
      <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white">
        <option value="instagram">Instagram</option>
        <option value="tiktok">TikTok</option>
      </select>
      <label className="block text-sm font-bold" htmlFor="label">Account label</label>
      <input id="label" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="@costa.studio" className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white" />
      <button type="submit" className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">Add sandbox destination</button>
      {result && <p role="status" className="text-sm text-white/70">{result}</p>}
    </form>
  );
}

export function CreatePostForm() {
  const [destination, setDestination] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <form
      className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          const created = await m2CreatePost({ destinationExternalId: destination, language: "en", requestedCount: 10, contentIntent: "post" });
          setResult(`Post ${created.postRequestId} created in REVIEW (provider-disabled).`);
        } catch (cause) {
          setResult(cause instanceof Error ? cause.message : "Failed to create post");
        }
      }}
    >
      <label className="block text-sm font-bold" htmlFor="dst">Destination external id</label>
      <input id="dst" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="dst_..." className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white" />
      <button type="submit" className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">Create Post</button>
      {result && <p role="status" className="text-sm text-white/70">{result}</p>}
    </form>
  );
}

export function WatchForm({ cost = 1, batchAvailable = true }: { cost?: number; batchAvailable?: boolean }) {
  const [profileUrl, setProfileUrl] = useState("");
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runWatch() {
    setBusy(true);
    try {
      const report = await m2RunWatch(profileUrl, "instagram", true);
      setResult(`Watch ${report.status} — report ${report.reportExternalId} (provider-disabled, exact credit preview + confirmation).`);
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Failed to run Watch");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (step === "input") {
          setStep("confirm");
          return;
        }
        await runWatch();
      }}
    >
      <label className="block text-sm font-bold" htmlFor="profile">Public profile URL</label>
      <input id="profile" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://www.instagram.com/..." className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white" />

      {step === "confirm" ? (
        <div className="rounded-2xl border border-[var(--social-blue)]/40 bg-[var(--social-blue)]/10 p-4">
          <p className="text-sm font-bold">Confirm exact cost</p>
          <p className="mt-1 text-sm text-white/75">One Basic Profile Analysis for <strong>{profileUrl}</strong> runs a provider-disabled analysis and consumes <strong>{cost} credit{cost === 1 ? "" : "s"}</strong>{batchAvailable ? "" : " — no spendable batch is currently available."} Credits are held, then finalized on success or refunded on failure.</p>
          <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I confirm the exact credit cost and that this runs provider-disabled.
          </label>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={!confirmed || busy} className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">Confirm and run Watch</button>
            <button type="button" onClick={() => { setStep("input"); setConfirmed(false); }} className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white/70">Back</button>
          </div>
        </div>
      ) : (
        <button type="submit" className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">Preview Watch cost</button>
      )}
      {result && <p role="status" className="text-sm text-white/70">{result}</p>}
    </form>
  );
}

export function OnboardingFirstPostForm({ destinations }: { destinations: Array<{ externalId: string; label: string; platform: string }> }) {
  const [destination, setDestination] = useState(destinations[0]?.externalId ?? "");
  const [result, setResult] = useState<string | null>(null);
  return (
    <form
      className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          const journey = await m2FirstPostAndPlan({ destinationExternalId: destination, businessName: "My business", topic: "introduction", language: "en" });
          setResult(`First post ${journey.postStatus} + 7-day plan created (no credits spent).`);
        } catch (cause) {
          setResult(cause instanceof Error ? cause.message : "Failed");
        }
      }}
    >
      <label className="block text-sm font-bold" htmlFor="odst">Sandbox destination</label>
      {destinations.length === 0 ? (
        <p className="text-sm text-white/60">Add a sandbox Instagram/TikTok destination in Connections first.</p>
      ) : (
        <select id="odst" value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white">
          {destinations.map((d) => (
            <option key={d.externalId} value={d.externalId}>{d.label} ({d.platform})</option>
          ))}
        </select>
      )}
      <button type="submit" disabled={destinations.length === 0} className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">Create first post + 7-day plan</button>
      {result && <p role="status" className="text-sm text-white/70">{result}</p>}
    </form>
  );
}
