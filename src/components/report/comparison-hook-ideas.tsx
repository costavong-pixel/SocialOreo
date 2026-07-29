"use client";

import { useState } from "react";

import type { CompetitorHookExtraction } from "@/lib/reports/competitor-comparison";

type HookIdeas = {
  plainEnglishSummary: string;
  observations: Array<{ title: string; detail: string }>;
  examples: Array<{ title: string; hook: string; whyItFits: string; plan: { first3Seconds: string; showNext: string; closingCta: string } }>;
};

export function ComparisonHookIdeas({ auditId, competitorId, extractions }: { auditId: string; competitorId: string; extractions: CompetitorHookExtraction[] }) {
  const [ideas, setIdeas] = useState<HookIdeas | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function generateIdeas() {
    setStatus("loading");
    try {
      const response = await fetch(`/api/audits/${auditId}/compare/hook-ideas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ competitorId }) });
      const body = await response.json() as HookIdeas & { error?: string };
      if (!response.ok) throw new Error(body.error);
      setIdeas(body);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="rounded-lg border border-violet-200/20 bg-violet-300/[0.06] p-5 sm:p-7">
      <p className="text-xs font-bold uppercase text-violet-100/70">Competitor hook ideas</p>
      <h2 className="mt-1 text-2xl font-black">Borrow the idea, not the words</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-violet-50/70">First, look at how they start. Then ask AI for two original examples written for your own audience and CTA.</p>
      <div className="mt-5 grid gap-3">{extractions.map((hook, index) => <article className="rounded-md border border-violet-100/10 bg-black/10 p-4" key={`${hook.sourceUrl}-${index}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase text-violet-200/70">What they are doing: {hook.pattern.replace(" hooks", "")}</p><a className="text-xs font-semibold text-violet-100 underline underline-offset-4 hover:text-white" href={hook.sourceUrl} rel="noreferrer" target="_blank">Open their reel</a></div><p className="mt-3 text-sm leading-6 text-violet-50/65">Their opening: “{hook.sourceHook}”</p><p className="mt-2 text-xs text-violet-100/50">{hook.evidence}</p></article>)}</div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button className="rounded-md bg-violet-200 px-4 py-2 text-sm font-bold text-violet-950 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={status === "loading"} onClick={generateIdeas} type="button">{status === "loading" ? "Writing examples..." : "Generate 2 tailored examples"}</button><p className="text-xs leading-5 text-violet-100/60">Uses a small AI request. It does not run a new audit or use a credit.</p></div>
      {status === "error" ? <p className="mt-3 text-sm text-rose-200">Could not generate examples. Please try again.</p> : null}
      {ideas ? <div className="mt-6 border-t border-violet-100/10 pt-5"><p className="text-sm leading-6 text-violet-50/75">{ideas.plainEnglishSummary}</p>{ideas.observations.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{ideas.observations.map((observation) => <article className="rounded-md border border-violet-100/10 bg-black/10 p-4" key={observation.title}><p className="text-xs font-bold uppercase text-violet-200/70">{observation.title}</p><p className="mt-2 text-sm leading-6 text-violet-50/75">{observation.detail}</p></article>)}</div> : null}<div className="mt-4 grid gap-3 md:grid-cols-2">{ideas.examples.map((example) => <article className="rounded-md border border-violet-100/10 bg-black/10 p-4" key={example.title}><p className="text-xs font-bold uppercase text-violet-200/70">{example.title}</p><p className="mt-2 text-base font-black leading-6 text-white">{example.hook}</p><p className="mt-3 text-sm leading-6 text-violet-50/65">Why this fits: {example.whyItFits}</p><div className="mt-4 border-t border-violet-100/10 pt-3 text-sm leading-6 text-violet-50/75"><p><span className="font-bold text-violet-100">First 3 seconds:</span> {example.plan.first3Seconds}</p><p className="mt-2"><span className="font-bold text-violet-100">Show next:</span> {example.plan.showNext}</p><p className="mt-2"><span className="font-bold text-violet-100">Close with:</span> {example.plan.closingCta}</p></div></article>)}</div></div> : null}
    </section>
  );
}
