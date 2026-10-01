"use client";

import { useState } from "react";
import { m2CreatePost, m2CreateMultiDestinationPost, m2RunWatch, m2FirstPostAndPlan, m2DeleteMedia, m2MediaPreviewUrl, m2PublishPost, m2UploadMedia } from "@/app/m2-actions";

export function CreatePostForm({ destinations = [] }: { destinations?: Array<{ externalId: string; label: string; platform: string; status?: string; providerDisabled?: boolean }> }) {
  const connectedDestinations = destinations.filter((item) => !item.status || item.status === "CONNECTED");
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>(connectedDestinations.slice(0, 1).map((item) => item.externalId));
  const [assetId, setAssetId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (destinations.length === 0) {
    return (
      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Create your first Post</h2>
        <p className="mt-2 text-sm text-white/65">Connect an account to create your first Post.</p>
        <a href="/connections" className="mt-4 inline-flex rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">Open Connections</a>
        <p className="mt-3 text-xs text-white/45">Staging notice: live social connections and delivery are not enabled here.</p>
      </div>
    );
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploaded = await m2UploadMedia(formData);
      const preview = await m2MediaPreviewUrl(uploaded.assetId);
      setAssetId(uploaded.assetId);
      setPreviewUrl(preview.url);
      setResult(`Media attached (${uploaded.mimeType}, ${uploaded.sizeBytes} bytes).`);
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Media upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeMedia() {
    if (!assetId) return;
    setBusy(true);
    try {
      await m2DeleteMedia(assetId);
      setAssetId(null);
      setPreviewUrl(null);
      setResult("Media removed.");
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Media could not be removed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.02] p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          if (selectedDestinations.length === 0) throw new Error("Select at least one publishing destination");
          const input = { language: "en", requestedCount: assetId ? 1 : 10, contentIntent: assetId ? "real-staging-post" : "post", mediaAssetIds: assetId ? [assetId] : [] };
          const created = selectedDestinations.length === 1
            ? await m2CreatePost({ ...input, destinationExternalId: selectedDestinations[0] })
            : await m2CreateMultiDestinationPost({ ...input, destinationExternalIds: selectedDestinations });
          setPostId(created.postRequestId);
          setResult(`Post saved in ${created.status}. Reload-safe database row created.`);
        } catch (cause) {
          setResult(cause instanceof Error ? cause.message : "Failed to create post");
        }
      }}
    >
      <label className="block text-sm font-bold" htmlFor="post-destination">Publishing destinations</label>
      {connectedDestinations.length === 1 ? (
        <select id="post-destination" aria-label="Connected account" value={selectedDestinations[0] ?? ""} onChange={(e) => setSelectedDestinations([e.target.value])} className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white">{connectedDestinations.map((item) => <option key={item.externalId} value={item.externalId}>{item.label} ({item.platform})</option>)}</select>
      ) : connectedDestinations.length > 1 ? (
        <div className="space-y-2 rounded-2xl border border-white/10 p-3">{connectedDestinations.map((item) => <label key={item.externalId} className="flex items-center gap-2 text-sm text-white/75"><input type="checkbox" aria-label={`Select ${item.label}`} checked={selectedDestinations.includes(item.externalId)} onChange={(event) => setSelectedDestinations((current) => event.target.checked ? [...new Set([...current, item.externalId])] : current.filter((id) => id !== item.externalId))} />{item.label} ({item.platform})</label>)}</div>
      ) : <p className="text-sm text-white/60">Connect a publishing destination first.</p>}
      <label className="block text-sm font-bold" htmlFor="post-media">Post media (platform validation applies)</label>
      <input id="post-media" type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} className="block w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:font-bold file:text-white" />
      {previewUrl && assetId ? <div className="flex items-center gap-3 rounded-2xl border border-white/10 p-3"><img src={previewUrl} alt="Post media preview" className="h-20 w-20 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="text-xs text-white/60">Owned media attached</p></div><button type="button" disabled={busy} onClick={() => void removeMedia()} className="rounded-full border border-rose-300/30 px-3 py-2 text-xs font-bold text-rose-200">Remove / replace</button></div> : null}
      <button type="submit" disabled={busy || selectedDestinations.length === 0 || connectedDestinations.length === 0} className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">{assetId ? "Create Post" : "Create draft"}</button>
      {postId ? <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const published = await m2PublishPost({ postRequestExternalId: postId }); setResult(`Publish result: ${published.status}. Provider receipt is shown on /posts.`); } catch (cause) { setResult(cause instanceof Error ? cause.message : "Publish failed"); } finally { setBusy(false); } }} className="ml-2 rounded-full border border-emerald-300/40 px-5 py-2.5 text-sm font-extrabold text-emerald-200 disabled:opacity-50">Publish now</button> : null}
      {result && <p role="status" className="text-sm text-white/70">{result}</p>}
    </form>
  );
}

export function WatchForm({ cost = 1, batchAvailable = true, providerDisabled = true }: { cost?: number; batchAvailable?: boolean; providerDisabled?: boolean }) {
  const [profileUrl, setProfileUrl] = useState("");
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runWatch() {
    setBusy(true);
    try {
      const report = await m2RunWatch(profileUrl, "instagram", true);
      const providerName = String(report.analysis?.profile?.provider ?? "");
      const liveObservation = Boolean(providerName && providerName !== "provider-disabled");
      setResult(`Watch ${report.status}. ${liveObservation ? "Live provider observation recorded." : "Staging preview recorded; no social provider was contacted."}`);
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
          <p className="mt-1 text-sm text-white/75">One Basic Profile Analysis for <strong>{profileUrl}</strong> uses <strong>{cost} credit{cost === 1 ? "" : "s"}</strong>{batchAvailable ? "" : " — no spendable batch is currently available."} Credits are held, then finalized on success or refunded on failure. {providerDisabled ? "This staging preview uses sample data; no social provider will be contacted." : "This staging environment may call the configured live provider."}</p>
          <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I confirm the exact credit cost and understand that this is a staging preview.
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
      <label className="block text-sm font-bold" htmlFor="odst">Social account</label>
      {destinations.length === 0 ? (
        <p className="text-sm text-white/60">Connect a social account in Connections first.</p>
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
