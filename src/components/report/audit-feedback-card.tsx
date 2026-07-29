"use client";

import { useState } from "react";

const usefulSections = [
  "Public performance",
  "Action plan",
  "Score breakdown",
  "What is working",
  "What is hurting",
  "Reel structures",
  "Content pack",
] as const;

type Feedback = {
  rating: "HELPFUL" | "NOT_YET";
  usefulSections: string[];
  comments: string | null;
};

export function AuditFeedbackCard({
  auditId,
  initialFeedback,
}: {
  auditId: string;
  initialFeedback?: Feedback | null;
}) {
  const [rating, setRating] = useState<Feedback["rating"] | null>(initialFeedback?.rating ?? null);
  const [sections, setSections] = useState<string[]>(initialFeedback?.usefulSections ?? []);
  const [comments, setComments] = useState(initialFeedback?.comments ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function toggleSection(section: string) {
    setSections((current) => current.includes(section)
      ? current.filter((item) => item !== section)
      : [...current, section]);
    setStatus("idle");
  }

  async function saveFeedback() {
    if (!rating) return;

    setStatus("saving");

    try {
      const response = await fetch(`/api/audits/${auditId}/feedback`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          usefulSections: sections,
          comments,
        }),
      });

      if (!response.ok) {
        throw new Error("Feedback could not be saved.");
      }

      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#101318] p-5 sm:p-7">
      <p className="text-xs font-bold uppercase text-orange-300">Beta feedback</p>
      <h2 className="mt-1 text-2xl font-black tracking-normal">Share feedback</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Choose a rating, add an optional note, then send it. You can update your response any time.</p>

      <fieldset className="mt-6">
        <legend className="text-sm font-bold text-white">Was this report useful?</legend>
        <p className="mt-1 text-sm text-white/50">Choose one option to continue.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button
          aria-pressed={rating === "HELPFUL"}
          className={`rounded-md border px-4 py-3 text-left transition ${rating === "HELPFUL" ? "border-emerald-300 bg-emerald-400/10 text-emerald-50" : "border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.06]"}`}
          onClick={() => { setRating("HELPFUL"); setStatus("idle"); }}
          type="button"
        >
          <span className="font-black">Helpful</span>
          <span className="mt-1 block text-sm opacity-70">I can use this report.</span>
        </button>
        <button
          aria-pressed={rating === "NOT_YET"}
          className={`rounded-md border px-4 py-3 text-left transition ${rating === "NOT_YET" ? "border-amber-300 bg-amber-400/10 text-amber-50" : "border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.06]"}`}
          onClick={() => { setRating("NOT_YET"); setStatus("idle"); }}
          type="button"
        >
          <span className="font-black">Needs improvement</span>
          <span className="mt-1 block text-sm opacity-70">I need something clearer or more useful.</span>
        </button>
        </div>
        {rating && status !== "saved" ? <p className="mt-3 text-sm text-emerald-300">Selected. Add a note below if you want, then send your feedback.</p> : null}
      </fieldset>

      <label className="mt-6 block text-sm font-bold text-white" htmlFor={`feedback-comments-${auditId}`}>
        Tell us more <span className="font-normal text-white/45">Optional</span>
      </label>
      <textarea
        className="mt-3 min-h-28 w-full rounded-md border border-white/10 bg-white/[0.025] p-3 text-sm leading-6 text-white outline-none placeholder:text-white/35 focus:border-orange-300"
        id={`feedback-comments-${auditId}`}
        maxLength={2000}
        onChange={(event) => { setComments(event.target.value); setStatus("idle"); }}
        placeholder="What was useful, confusing, or missing?"
        value={comments}
      />

      <details className="mt-5 rounded-md border border-white/10 bg-white/[0.025] p-3">
        <summary className="cursor-pointer text-sm font-bold text-white">Add report topics <span className="font-normal text-white/45">Optional</span></summary>
        <p className="mt-2 text-sm text-white/50">Select any parts that relate to your feedback.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {usefulSections.map((section) => {
            const selected = sections.includes(section);

            return (
              <button
                aria-pressed={selected}
                className={`rounded-full border px-3 py-2 text-sm transition ${selected ? "border-orange-300 bg-orange-400/15 text-orange-100" : "border-white/10 bg-white/[0.025] text-white/70 hover:bg-white/[0.06]"}`}
                key={section}
                onClick={() => toggleSection(section)}
                type="button"
              >
                {section}
              </button>
            );
          })}
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded-md bg-orange-400 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!rating || status === "saving"}
          onClick={saveFeedback}
          type="button"
        >
          {status === "saving" ? "Saving..." : initialFeedback || status === "saved" ? "Update feedback" : "Send feedback"}
        </button>
        {status === "saved" ? <p className="text-sm text-emerald-300">Feedback saved. You can update it any time.</p> : null}
        {status === "error" ? <p className="text-sm text-rose-300">Could not save feedback. Please try again.</p> : null}
      </div>
    </section>
  );
}
