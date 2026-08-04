"use client";

import { useState } from "react";
import Link from "next/link";
import { m2Demo, type M2DemoResponse } from "@/app/m2-actions";

export function DemoForm({ signedIn }: { signedIn: boolean }) {
  const [topic, setTopic] = useState("baking");
  const [response, setResponse] = useState<M2DemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const result = await m2Demo(topic);
      setResponse(result);
      if (result.status === "ok") {
        setTitle(result.demo.title);
        setCaption(result.demo.caption);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
      window.alert(`Copied ${label} to clipboard.`);
    } catch {
      setError("Clipboard is unavailable in this browser — select and copy manually.");
    }
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void generate();
      }}
    >
      <label className="block text-sm font-bold" htmlFor="topic">What are you posting about?</label>
      <input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-[var(--social-blue)]" />
      <button type="submit" disabled={busy} className="rounded-full bg-[var(--social-blue)] px-6 py-3 text-base font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">
        {busy ? "Generating…" : "Generate demo"}
      </button>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

      {response?.status === "already-used" ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="font-display text-lg font-extrabold">Already used — sign in to continue</p>
          <p className="mt-2 text-sm text-white/70">You have already used your one free demo on this device. Sign in to keep going with your workspace.</p>
          <Link className="mt-4 inline-block rounded-full bg-[var(--social-blue)] px-6 py-3 text-base font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]" href="/sign-in">Sign in</Link>
        </div>
      ) : null}

      {response?.status === "ok" ? (
        <div className="rounded-3xl border border-[var(--social-blue)] bg-white/5 p-5">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--social-blue)]">
            DEMO — editable and copyable{response.reRun ? " (re-run)" : ""}
          </p>
          <label className="mt-3 block text-xs font-bold text-white/60" htmlFor="demo-title">Title</label>
          <input id="demo-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 font-display text-lg font-extrabold text-white" />
          <label className="mt-3 block text-xs font-bold text-white/60" htmlFor="demo-caption">Caption</label>
          <textarea id="demo-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className="mt-1 w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(title, "title")} className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10">Copy title</button>
            <button type="button" onClick={() => copy(caption, "caption")} className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10">Copy caption</button>
          </div>
          <p className="mt-3 text-xs text-white/50">Lifetime plan: {response.demo.price} · Nothing is published or saved without consent.</p>

          {signedIn ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <label className="flex items-start gap-2 text-sm text-white/80">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>I consent to transferring my demo content to my account.</span>
              </label>
              {consent ? (
                <p className="mt-2 rounded-xl bg-[var(--social-blue)]/10 px-3 py-2 text-xs text-white/70">
                  With your consent, your edited title and caption can be moved into your workspace when you sign in. Nothing transfers automatically and nothing is published.
                </p>
              ) : (
                <p className="mt-2 text-xs text-white/40">Your demo content stays on this device until you consent to transfer it to your account.</p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-white/60">
              Want to keep going? <Link className="text-[var(--social-blue)] hover:underline" href="/sign-in">Sign in</Link> — we will only transfer your demo content with your explicit consent.
            </p>
          )}
        </div>
      ) : null}
    </form>
  );
}
