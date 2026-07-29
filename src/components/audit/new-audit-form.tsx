"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  campaignBriefSchema,
  campaignGoalOptions,
  campaignNicheOptions,
  campaignOccasionOptions,
  campaignToneOptions,
  type CampaignBrief,
} from "@/lib/campaign-brief/types";
import type { RequestedTier } from "@/lib/credits/audit-tier";
import { PurchaseButtons } from "@/components/payments/purchase-buttons";

type Step = "url" | "brief" | "submitting";

const initialBrief: CampaignBrief = {
  occasion: campaignOccasionOptions[0].value,
  goal: campaignGoalOptions[0].value,
  niche: campaignNicheOptions[0].value,
  targetAudience: "",
  offerOrCta: "",
  tone: campaignToneOptions[0].value,
};

export function NewAuditForm({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [brief, setBrief] = useState<CampaignBrief>(initialBrief);
  const [nicheChoice, setNicheChoice] = useState(initialBrief.niche);
  const [customNiche, setCustomNiche] = useState("");
  const [requestedTier, setRequestedTier] = useState<RequestedTier>("free");
  const [error, setError] = useState<string | null>(null);
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "loading" | "error">("idle");

  async function suggestBriefFields() {
    setSuggestionStatus("loading");

    try {
      const response = await fetch("/api/campaign-brief/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occasion: brief.occasion, goal: brief.goal, niche: brief.niche, tone: brief.tone }),
      });
      const payload = await response.json() as { targetAudience?: string; offerOrCta?: string; error?: string };
      if (!response.ok || !payload.targetAudience || !payload.offerOrCta) throw new Error(payload.error);

      setBrief((current) => ({ ...current, targetAudience: payload.targetAudience!, offerOrCta: payload.offerOrCta! }));
      setSuggestionStatus("idle");
    } catch {
      setSuggestionStatus("error");
    }
  }

  function handleContinueToBrief(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError("Enter an Instagram profile/reel URL or a TikTok profile URL.");
      return;
    }

    setStep("brief");
  }

  async function handleSubmitAudit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (nicheChoice === "other" && !customNiche.trim()) {
      setError("Tell us your niche.");
      return;
    }

    const validatedBrief = campaignBriefSchema.safeParse(brief);

    if (!validatedBrief.success) {
      setError(validatedBrief.error.issues[0]?.message ?? "Complete the campaign brief.");
      return;
    }

    setStep("submitting");

    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          campaignBrief: validatedBrief.data,
          requestedTier,
        }),
      });

      const payload = (await response.json()) as {
        auditJobId?: string;
        error?: string;
      };

      if (!response.ok || !payload.auditJobId) {
        setStep("brief");
        setError(payload.error ?? "We could not start this audit.");
        return;
      }

      router.push(`/audits/${payload.auditJobId}`);
    } catch {
      setStep("brief");
      setError("Network error. Please try again.");
    }
  }

  if (step === "submitting") {
    return (
      <div className="mt-10 rounded-[2rem] border border-black/10 bg-white/70 p-6 shadow-sm md:p-10">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-black/50">Running audit</p>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">Analyzing profile and building your report…</h1>
        <p className="mt-4 text-black/70">This can take up to a minute while we fetch reels and score your campaign fit.</p>
        <div className="mt-8 h-2 overflow-hidden rounded-full bg-black/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-black" />
        </div>
      </div>
    );
  }

  if (step === "brief") {
    return (
      <div className="mt-10 rounded-[2rem] border border-black/10 bg-white/70 p-6 shadow-sm md:p-10">
        <button
          className="text-sm font-semibold text-black/60 hover:text-black"
          onClick={() => setStep("url")}
          type="button"
        >
          ← Back to URL
        </button>
        <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/45">Profile URL</p>
          <p className="mt-2 break-all text-sm font-semibold text-black">{url.trim()}</p>
        </div>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-black/50">Campaign brief</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">Tell SocialOreo what you are trying to achieve.</h1>
        <p className="mt-4 text-black/70">SocialOreo scores and recommends based on your goal — not generic reach.</p>

        <form className="mt-8 grid gap-4" onSubmit={handleSubmitAudit}>
          <label className="grid gap-2">
            <span className="text-sm font-bold">Occasion</span>
            <select
              className="rounded-2xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
              onChange={(event) => setBrief((current) => ({ ...current, occasion: event.target.value }))}
              value={brief.occasion}
            >
              {campaignOccasionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Goal</span>
            <select
              className="rounded-2xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
              onChange={(event) =>
                setBrief((current) => ({ ...current, goal: event.target.value as CampaignBrief["goal"] }))
              }
              value={brief.goal}
            >
              {campaignGoalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Niche</span>
            <select
              className="rounded-2xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
              onChange={(event) => {
                const value = event.target.value;
                setNicheChoice(value);
                setBrief((current) => ({ ...current, niche: value === "other" ? customNiche : value }));
              }}
              value={nicheChoice}
            >
              {campaignNicheOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {nicheChoice === "other" ? (
            <label className="grid gap-2">
              <span className="text-sm font-bold">What is your niche?</span>
              <input
                autoFocus
                className="rounded-2xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
                onChange={(event) => {
                  const value = event.target.value;
                  setCustomNiche(value);
                  setBrief((current) => ({ ...current, niche: value }));
                }}
                placeholder="e.g. HGTV interior designer and home renovation host"
                value={customNiche}
              />
            </label>
          ) : null}

          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
            <p className="font-bold">Not sure what to write?</p>
            <p className="mt-1 text-sm text-black/65">SocialOreo can suggest a target audience and CTA from the choices above. You can edit both before running the audit.</p>
            <button
              className="mt-3 rounded-full bg-black px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={suggestionStatus === "loading" || (nicheChoice === "other" && !customNiche.trim())}
              onClick={suggestBriefFields}
              type="button"
            >
              {suggestionStatus === "loading" ? "Thinking..." : "Help me fill this"}
            </button>
            {suggestionStatus === "error" ? <p className="mt-2 text-sm font-semibold text-red-700">Suggestion unavailable. You can still write your own answer.</p> : null}
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Target audience</span>
            <input
              className="rounded-2xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
              onChange={(event) => setBrief((current) => ({ ...current, targetAudience: event.target.value }))}
              placeholder="Local foodies aged 25-40 in Austin"
              value={brief.targetAudience}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Offer or CTA</span>
            <input
              className="rounded-2xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
              onChange={(event) => setBrief((current) => ({ ...current, offerOrCta: event.target.value }))}
              placeholder="Book a table this weekend / DM MENU"
              value={brief.offerOrCta}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Tone</span>
            <select
              className="rounded-2xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
              onChange={(event) =>
                setBrief((current) => ({ ...current, tone: event.target.value as CampaignBrief["tone"] }))
              }
              value={brief.tone}
            >
              {campaignToneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-3 rounded-2xl border border-black/10 bg-white p-4">
            <legend className="px-1 text-sm font-bold">Audit tier</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/10 p-4 transition has-checked:border-black has-checked:bg-black/[0.03]">
              <input
                checked={requestedTier === "free"}
                className="mt-1"
                name="requestedTier"
                onChange={() => setRequestedTier("free")}
                type="radio"
                value="free"
              />
              <span>
                <span className="block font-bold">Free audit — 7 reels</span>
                <span className="mt-1 block text-sm text-black/65">
                  {isAdmin
                    ? "Admin testing: unlimited 7-reel audits. No credit required."
                    : "One free audit per verified account. Great for a quick campaign snapshot."}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-black/10 p-4 transition has-checked:border-black has-checked:bg-black/[0.03]">
              <input
                checked={requestedTier === "paid"}
                className="mt-1"
                name="requestedTier"
                onChange={() => setRequestedTier("paid")}
                type="radio"
                value="paid"
              />
              <span>
                <span className="block font-bold">Full audit — 30 reels, 1 credit</span>
                <span className="mt-1 block text-sm text-black/65">
                  Deeper reel sample and scoring. Uses one credit from your balance.
                </span>
              </span>
            </label>
            {requestedTier === "paid" ? <PurchaseButtons /> : null}
          </fieldset>

          {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}

          <button
            className="mt-2 rounded-full bg-black px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
            type="submit"
          >
            Run audit
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-[2rem] border border-black/10 bg-white/70 p-6 shadow-sm md:p-10">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-black/50">Public profile audit</p>
      <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-5xl">Start with a public profile or reel.</h1>
      <p className="mt-4 text-black/70">Paste a public Instagram profile or reel, or a TikTok profile. SocialOreo will review recent public videos and score them against your campaign goal.</p>

      <form className="mt-8 grid gap-4" onSubmit={handleContinueToBrief}>
        <label className="grid gap-2">
          <span className="text-sm font-bold">Instagram or TikTok URL</span>
          <input
            className="rounded-2xl border border-black/15 bg-white px-4 py-3 outline-none transition focus:border-black"
            name="url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.instagram.com/username/ or https://www.tiktok.com/@username"
            type="url"
            value={url}
          />
        </label>

        {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}

        <button
          className="mt-2 rounded-full bg-black px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5"
          type="submit"
        >
          Continue to campaign brief
        </button>
      </form>
    </div>
  );
}
