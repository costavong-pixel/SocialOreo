"use client";

import { useState } from "react";
import { m2OnboardingPropose, m2OnboardingConfirm } from "@/app/m2-actions";
import { profileFieldSchema, type ProfileField, type ProfileDraft } from "@/lib/socialolla/onboarding/onboarding";

type Decision = "accept" | "edit" | "reject" | "skip";

type FieldState = { field: ProfileField; decision: Decision; value: string };

const FIELDS: { field: ProfileField; label: string; key: "businessName" | "niche" | "tone" | "primaryPlatform" }[] = [
  { field: "businessName", label: "Business name", key: "businessName" },
  { field: "niche", label: "Niche", key: "niche" },
  { field: "tone", label: "Tone", key: "tone" },
  { field: "primaryPlatform", label: "Primary platform", key: "primaryPlatform" },
];

export function OnboardingProfileReview() {
  const [purpose, setPurpose] = useState("coffee shop, playful, instagram");
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [status, setStatus] = useState<string | null>(null);

  async function propose() {
    setStatus(null);
    try {
      const proposal = await m2OnboardingPropose(purpose);
      setDraft(proposal.draft as ProfileDraft);
      setEdits({});
      setDecisions({});
      setStatus("Proposal ready — review each suggested field below. Nothing is invented; your choices are used to build an approved profile.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not propose profile");
    }
  }

  async function confirm() {
    try {
      const approvedFields = Object.entries(decisions)
        .filter(([, decision]) => decision !== "reject" && decision !== "skip")
        .map(([field]) => field as ProfileField);
      if (approvedFields.length === 0) {
        setStatus("At least one field must be accepted or edited before confirming.");
        return;
      }
      const result = await m2OnboardingConfirm({
        businessName: decisions.businessName === "reject" || decisions.businessName === "skip" ? "Unnamed business" : (edits.businessName ?? draft?.businessName ?? "Unnamed business"),
        niche: decisions.niche === "reject" || decisions.niche === "skip" ? undefined : (edits.niche ?? draft?.niche),
        tone: decisions.tone === "reject" || decisions.tone === "skip" ? undefined : (edits.tone ?? draft?.tone),
        primaryPlatform: decisions.primaryPlatform === "reject" || decisions.primaryPlatform === "skip" ? undefined : (edits.primaryPlatform ?? draft?.primaryPlatform),
        approvedFields,
      });
      setStatus(`Profile confirmed — approved profile ${result.profileExternalId}.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not confirm profile");
    }
  }

  function setDecision(field: ProfileField, decision: Decision) {
    setDecisions((prev) => ({ ...prev, [field]: decision }));
  }

  function isConfirmedField(field: ProfileField) {
    const decision = decisions[field];
    return decision === "accept" || decision === "edit";
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-bold" htmlFor="purpose">Your business purpose (used to propose, never to invent)</label>
      <textarea id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white" />
      <button type="button" onClick={propose} className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">Propose profile</button>

      {draft && (
        <div className="space-y-4">
          {FIELDS.map(({ field, label, key }) => {
            const current = decisions[field] === "edit" ? edits[key] : draft[key];
            return (
              <div key={field} className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <p className="text-sm font-bold">{label}</p>
                {decisions[field] === "edit" ? (
                  <input value={edits[key] ?? draft[key] ?? ""} onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))} className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white" />
                ) : (
                  <p className="mt-1 text-white/80">{draft[key] ?? "—"}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["accept", "edit", "reject", "skip"] as Decision[]).map((decision) => (
                    <button
                      key={decision}
                      type="button"
                      onClick={() => setDecision(field, decision)}
                      aria-pressed={decisions[field] === decision}
                      className={`rounded-full px-3 py-1 text-xs font-bold ${decisions[field] === decision ? "bg-[var(--social-blue)] text-[var(--social-ink)]" : "border border-white/15 text-white/70 hover:bg-white/10"}`}
                    >
                      {decision}
                    </button>
                  ))}
                </div>
                {current && isConfirmedField(field) && (
                  <p className="mt-2 text-xs text-white/50">Will use: <code>{current}</code></p>
                )}
              </div>
            );
          })}
          <button type="button" onClick={confirm} className="rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]">Confirm approved profile</button>
        </div>
      )}

      {status && <p role="status" className="text-sm text-white/70">{status}</p>}
    </div>
  );
}
