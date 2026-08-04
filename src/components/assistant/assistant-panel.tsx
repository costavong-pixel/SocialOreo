"use client";

import { useState } from "react";
import { m2AssistantRespond } from "@/app/m2-actions";
import type { AssistantDomain } from "@/lib/socialolla/assistant/assistant";

const DOMAINS: { value: AssistantDomain; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "profile_maintenance", label: "Profile maintenance" },
  { value: "post_assistance", label: "Post assistance" },
  { value: "watch_assistance", label: "Watch assistance" },
  { value: "credits_and_costs", label: "Credits and costs" },
  { value: "failures_and_notifications", label: "Failures and notifications" },
  { value: "support_escalation", label: "Support escalation" },
];

// Display-only classification mirroring the server-side classifier. The server
// remains authoritative (assistantRespond derives the real action and blocks
// Execute for guests) — this only guides the guest UX.
function localClassify(intent: string): string {
  const text = intent.trim().toLowerCase();
  if (text.startsWith("explain") || text.startsWith("why") || text.startsWith("how much")) return "Explain";
  if (text.startsWith("draft") || text.startsWith("write") || text.startsWith("generate")) return "Draft";
  if (text.startsWith("propose") || text.startsWith("suggest")) return "ProposeAction";
  if (text.startsWith("execute") || text.startsWith("publish") || text.startsWith("post") || text.startsWith("start watch")) return "Execute";
  return "Explain";
}

type AssistantReply = {
  action: string;
  summary: string;
  blocked?: boolean;
  requiresConfirmation?: boolean;
  confirmationToken?: string;
  transcript?: string;
};

export function AssistantPanel({ floating = false, authenticated = false }: { floating?: boolean; authenticated?: boolean }) {
  const [open, setOpen] = useState(!floating);
  const [intent, setIntent] = useState("");
  const [domain, setDomain] = useState<AssistantDomain>("onboarding");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inferredAction = intent.trim() ? localClassify(intent) : null;
  const executeAttemptedAsGuest = !authenticated && inferredAction === "Execute";

  async function respond(overrides?: { providedToken?: string; preview?: string }) {
    setBusy(true);
    setError(null);
    try {
      const response = await m2AssistantRespond({
        intent,
        domain,
        ...(overrides?.providedToken ? { providedToken: overrides.providedToken, expectedToken: reply?.confirmationToken, preview: overrides.preview ?? preview } : {}),
      });
      setReply(response as AssistantReply);
      if (overrides?.providedToken) setPreview("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assistant unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={floating ? "fixed bottom-4 end-4 z-40 w-[min(92vw,22rem)]" : "w-full"}>
      {!open ? (
        <button
          type="button"
          aria-expanded={open}
          className="ms-auto block rounded-full bg-[var(--social-blue)] px-5 py-3 text-sm font-extrabold text-[var(--social-ink)] shadow-lg hover:bg-[#cdbbff]"
          onClick={() => setOpen(true)}
        >
          Assistant
        </button>
      ) : (
        <section aria-label="SocialOlla assistant" className="flex max-h-[80dvh] flex-col rounded-3xl border border-white/10 bg-[var(--social-surface)] shadow-2xl">
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="font-display text-sm font-extrabold">Assistant</p>
            <button type="button" aria-label="Close assistant" className="rounded-full px-2 py-1 text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)}>
              Close
            </button>
          </header>

          <div className="grid gap-3 overflow-y-auto p-4">
            <div className="grid gap-2">
              <label className="text-xs font-bold text-white/60" htmlFor="assistant-intent">What would you like to do?</label>
              <textarea
                id="assistant-intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                rows={2}
                placeholder="e.g. explain how credits work"
                className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-bold text-white/60" htmlFor="assistant-domain">Domain</label>
              <select id="assistant-domain" value={domain} onChange={(e) => setDomain(e.target.value as AssistantDomain)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white">
                {DOMAINS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {executeAttemptedAsGuest ? (
              <p className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                Execute is restricted to signed-in users. Guests can use Explain and Draft — sign in to run protected actions.
              </p>
            ) : null}

            <button
              type="button"
              disabled={busy || !intent.trim()}
              onClick={() => respond()}
              className="rounded-full bg-[var(--social-blue)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50"
            >
              {busy ? "Working…" : "Send"}
            </button>

            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}

            {reply ? (
              <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--social-blue)]">Action: {reply.action}</p>
                <p className="text-sm text-white/85">{reply.summary}</p>
                {reply.requiresConfirmation && reply.confirmationToken ? (
                  <div className="grid gap-2 rounded-2xl border border-[var(--social-blue)]/40 bg-[var(--social-blue)]/10 p-3">
                    <p className="text-xs font-bold text-white/75">Protected action — exact preview and confirmation required.</p>
                    <label className="text-xs font-bold text-white/60" htmlFor="assistant-preview">Exact preview</label>
                    <textarea
                      id="assistant-preview"
                      value={preview}
                      onChange={(e) => setPreview(e.target.value)}
                      rows={2}
                      placeholder={reply.summary}
                      className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
                    />
                    <p className="text-xs text-white/50">Confirmation token: <code>{reply.confirmationToken}</code></p>
                    <button
                      type="button"
                      disabled={busy || !preview.trim()}
                      onClick={() => respond({ providedToken: reply.confirmationToken, preview })}
                      className="rounded-full bg-[var(--social-blue)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50"
                    >
                      Confirm execute
                    </button>
                  </div>
                ) : null}
                {reply.transcript ? (
                  <p className="border-t border-white/10 pt-2 text-xs text-white/50">
                    <span className="font-bold text-white/70">Sanitized transcript:</span> {reply.transcript}
                  </p>
                ) : null}
              </div>
            ) : null}

            <p className="text-[11px] leading-4 text-white/40">
              Transcripts are sanitized server-side — no chain-of-thought, secrets, raw provider payloads, or cross-account data.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
