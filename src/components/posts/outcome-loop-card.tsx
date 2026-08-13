"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  m2ConfirmManualPublication,
  m2DecideOutcomeRecommendation,
  m2RecordOutcomeMetrics,
} from "@/app/m2-actions";
import type { NextPlanRecommendation, OutcomeEvidence } from "@/lib/socialolla/outcomes/outcome-evaluator";

export type OutcomeLoopCardData = {
  externalId: string;
  platform: string;
  approvedAt: string;
  publication: { externalId: string; platformPostUrl: string; publishedAt: string; confirmedAt: string } | null;
  metricSnapshots: Array<{
    id: string;
    capturedAt: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    reach: number | null;
  }>;
  evaluation: {
    status: "INSUFFICIENT_EVIDENCE" | "READY";
    decision: "KEEP" | "CHANGE" | "PAUSE" | null;
    confidence: number;
    summary: string;
    evidence: OutcomeEvidence | null;
  } | null;
  recommendation: {
    externalId: string;
    status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
    plan: NextPlanRecommendation | null;
  } | null;
};

function localDateToIso(value: string, label: string): string {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error(`${label} is required.`);
  return date.toISOString();
}

function wholeNumberOrNull(value: string, label: string, required = false): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }
  if (!/^\d+$/.test(trimmed)) throw new Error(`${label} must be a whole number.`);
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} is too large.`);
  return parsed;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function MetricSummary({ snapshot }: { snapshot: OutcomeLoopCardData["metricSnapshots"][number] }) {
  const visible = [
    ["views", snapshot.views],
    ["likes", snapshot.likes],
    ["comments", snapshot.comments],
    ["shares", snapshot.shares],
    ["saves", snapshot.saves],
    ["reach", snapshot.reach],
  ].filter(([, value]) => value !== null);
  return <p className="mt-1 text-xs text-white/60">{formatDate(snapshot.capturedAt)} · {visible.map(([label, value]) => `${value} ${label}`).join(" · ")}</p>;
}

export function OutcomeLoopCard({ outcome }: { outcome: OutcomeLoopCardData | null }) {
  const router = useRouter();
  const [publicationUrl, setPublicationUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [capturedAt, setCapturedAt] = useState("");
  const [metrics, setMetrics] = useState({ views: "", likes: "", comments: "", shares: "", saves: "", reach: "" });
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function confirmPublication() {
    if (!outcome) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await m2ConfirmManualPublication({
        contentVersionExternalId: outcome.externalId,
        platformPostUrl: publicationUrl,
        publishedAt: localDateToIso(publishedAt, "Published time"),
        confirmed: publicationConfirmed,
      });
      setResult(response.reused ? "The manual publication was already recorded." : "Manual publication recorded. No provider or publishing action was performed.");
      router.refresh();
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Could not record manual publication.");
    } finally {
      setBusy(false);
    }
  }

  async function recordMetrics() {
    if (!outcome) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await m2RecordOutcomeMetrics({
        contentVersionExternalId: outcome.externalId,
        capturedAt: localDateToIso(capturedAt, "Captured time"),
        views: wholeNumberOrNull(metrics.views, "Views", true),
        likes: wholeNumberOrNull(metrics.likes, "Likes"),
        comments: wholeNumberOrNull(metrics.comments, "Comments"),
        shares: wholeNumberOrNull(metrics.shares, "Shares"),
        saves: wholeNumberOrNull(metrics.saves, "Saves"),
        reach: wholeNumberOrNull(metrics.reach, "Reach"),
      });
      setResult(
        response.evaluation.status === "READY"
          ? "Metrics recorded and a pending next-plan recommendation was created. It cannot create or schedule content."
          : response.evaluation.summary,
      );
      router.refresh();
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Could not record metrics.");
    } finally {
      setBusy(false);
    }
  }

  async function decideRecommendation(decision: "APPROVED" | "REJECTED") {
    if (!outcome?.recommendation) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await m2DecideOutcomeRecommendation({
        recommendationExternalId: outcome.recommendation.externalId,
        decision,
        confirmed: decision === "APPROVED" ? approvalConfirmed : true,
      });
      setResult(
        response.status === "APPROVED"
          ? "Recommendation approved. No draft, schedule, publication, or provider call was created."
          : "Recommendation rejected. No content action was created.",
      );
      router.refresh();
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Could not update recommendation.");
    } finally {
      setBusy(false);
    }
  }

  if (!outcome) {
    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--social-blue)]">Outcome loop v1</p>
        <p className="mt-1 text-sm text-white/70">When a final variant is approved and scheduled, SocialOlla will preserve an immutable content version here. It will not publish it.</p>
      </div>
    );
  }

  const latestSnapshot = outcome.metricSnapshots[0];
  const recommendationPlan = outcome.recommendation?.plan;

  return (
    <div className="mt-3 grid gap-3 rounded-2xl border border-[var(--social-blue)]/25 bg-[var(--social-blue)]/[0.04] p-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--social-blue)]">Outcome loop v1 · manual evidence only</p>
        <p className="mt-1 text-sm text-white/70">Approved {formatDate(outcome.approvedAt)} · {outcome.platform} · immutable version <code>{outcome.externalId}</code></p>
        <p className="mt-1 text-xs text-white/50">No provider calls, publishing, scheduler, payment, or automatic follow-up post is part of this loop.</p>
      </div>

      {!outcome.publication ? (
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-sm font-bold">1. Confirm the post you published manually</p>
          <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`publication-url-${outcome.externalId}`}>
            Direct {outcome.platform} post URL
            <input id={`publication-url-${outcome.externalId}`} value={publicationUrl} onChange={(event) => setPublicationUrl(event.target.value)} placeholder="https://www.instagram.com/reel/..." className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`published-at-${outcome.externalId}`}>
            Published at (your local time)
            <input id={`published-at-${outcome.externalId}`} type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-white/70">
            <input type="checkbox" checked={publicationConfirmed} onChange={(event) => setPublicationConfirmed(event.target.checked)} />
            I confirm this is the direct post URL I published outside SocialOlla.
          </label>
          <button type="button" disabled={busy || !publicationConfirmed} onClick={confirmPublication} className="w-fit rounded-full bg-[var(--social-blue)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">Confirm manual publication</button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-sm text-white/70">
            <p className="font-bold text-white">Manual publication confirmed</p>
            <a href={outcome.publication.platformPostUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--social-blue)] underline">{outcome.publication.platformPostUrl}</a>
            <p className="mt-1 text-xs text-white/50">Published {formatDate(outcome.publication.publishedAt)} · provenance: manual owner confirmation.</p>
          </div>

          <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-sm font-bold">2. Record a platform metric snapshot</p>
            <p className="text-xs text-white/60">Use visible post-level metrics only. The loop needs two snapshots at least 24 hours apart, at least 48 hours after publishing, and three comparable posts with views plus visible interactions before it recommends a next plan.</p>
            <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`captured-at-${outcome.externalId}`}>
              Captured at (your local time)
              <input id={`captured-at-${outcome.externalId}`} type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["views", "likes", "comments", "shares", "saves", "reach"] as const).map((field) => (
                <label key={field} className="grid gap-1 text-xs font-bold capitalize text-white/60" htmlFor={`${field}-${outcome.externalId}`}>
                  {field}{field === "views" ? " (required)" : ""}
                  <input id={`${field}-${outcome.externalId}`} inputMode="numeric" value={metrics[field]} onChange={(event) => setMetrics((current) => ({ ...current, [field]: event.target.value }))} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
                </label>
              ))}
            </div>
            <button type="button" disabled={busy} onClick={recordMetrics} className="w-fit rounded-full bg-[var(--social-blue)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">Record manual metrics</button>
            {outcome.metricSnapshots.length > 0 ? (
              <div className="border-t border-white/10 pt-2">
                <p className="text-xs font-bold text-white/50">Latest manual observations</p>
                {outcome.metricSnapshots.slice(0, 3).map((snapshot) => <MetricSummary key={snapshot.id} snapshot={snapshot} />)}
              </div>
            ) : null}
          </div>
        </>
      )}

      {outcome.evaluation ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-sm font-bold">3. Evidence-based outcome evaluation</p>
          <p className="mt-1 text-sm text-white/70">{outcome.evaluation.summary}</p>
          <p className="mt-1 text-xs text-white/50">Status: <strong>{outcome.evaluation.status}</strong>{outcome.evaluation.decision ? ` · recommendation: ${outcome.evaluation.decision}` : ""}{outcome.evaluation.status === "READY" ? ` · confidence: ${outcome.evaluation.confidence}%` : ""}</p>
          {outcome.evaluation.evidence?.limitations.length ? <p className="mt-1 text-xs text-amber-200">Limitations: {outcome.evaluation.evidence.limitations.join(" ")}</p> : null}
          {latestSnapshot ? <p className="mt-1 text-xs text-white/50">Evaluation uses the latest recorded snapshot from {formatDate(latestSnapshot.capturedAt)}.</p> : null}
        </div>
      ) : null}

      {outcome.recommendation ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-sm font-bold">4. Owner decision for the next plan</p>
          <p className="mt-1 text-xs text-white/50">Recommendation status: <strong>{outcome.recommendation.status}</strong></p>
          {recommendationPlan ? (
            <div className="mt-2 grid gap-1 text-sm text-white/70">
              <p><strong className="text-white">Focus:</strong> {recommendationPlan.focus}</p>
              <p><strong className="text-white">Preserve:</strong> {recommendationPlan.preserve.join("; ")}</p>
              <p><strong className="text-white">Test:</strong> {recommendationPlan.test}</p>
              <p className="text-xs text-white/50">{recommendationPlan.approvalBoundary}</p>
            </div>
          ) : <p className="mt-1 text-sm text-amber-200">Recommendation detail is unavailable; do not use it to create content.</p>}
          {outcome.recommendation.status === "PENDING_APPROVAL" ? (
            <div className="mt-3 grid gap-2">
              <label className="flex items-center gap-2 text-xs font-bold text-white/70">
                <input type="checkbox" checked={approvalConfirmed} onChange={(event) => setApprovalConfirmed(event.target.checked)} />
                I approve this recommendation as a planning input only. It must not create or schedule content.
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !approvalConfirmed} onClick={() => decideRecommendation("APPROVED")} className="rounded-full bg-[var(--social-blue)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">Approve next-plan recommendation</button>
                <button type="button" disabled={busy} onClick={() => decideRecommendation("REJECTED")} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-white/70 disabled:opacity-50">Reject recommendation</button>
              </div>
            </div>
          ) : <p className="mt-2 text-xs text-white/50">No draft, schedule, publication, or provider call was created by this decision.</p>}
        </div>
      ) : null}

      {result ? <p role="status" className="text-sm text-white/80">{result}</p> : null}
    </div>
  );
}
