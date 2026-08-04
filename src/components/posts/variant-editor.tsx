"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { m2UpdateVariant } from "@/app/m2-actions";

export type VariantShape = {
  id: string;
  platform: string;
  title: string;
  caption: string | null;
  hashtags: string[];
  cta: string | null;
  isFinal: boolean;
  variantLocale: string;
};

export function VariantEditor({ postExternalId, variants }: { postExternalId: string; variants: VariantShape[] }) {
  const first = variants[0];
  const router = useRouter();
  const [title, setTitle] = useState(first?.title ?? "");
  const [caption, setCaption] = useState(first?.caption ?? "");
  const [hashtags, setHashtags] = useState((first?.hashtags ?? []).join(", "));
  const [cta, setCta] = useState(first?.cta ?? "");
  const [isFinal, setIsFinal] = useState(first?.isFinal ?? false);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function update() {
    setBusy(true);
    setResult(null);
    try {
      const hashtagList = hashtags.split(",").map((tag) => tag.trim()).filter(Boolean);
      const outcome = await m2UpdateVariant({
        postRequestExternalId: postExternalId,
        title,
        caption,
        hashtags: hashtagList,
        cta,
        isFinal,
      });
      setResult(outcome.updated ? `Variant updated${isFinal ? " and marked final" : ""}.` : "Variant update replayed.");
      router.refresh();
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Could not update variant");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--social-blue)]">Edit variant ({first?.platform ?? "instagram"})</p>
      <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`title-${postExternalId}`}>
        Title
        <input id={`title-${postExternalId}`} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`caption-${postExternalId}`}>
        Caption
        <textarea id={`caption-${postExternalId}`} value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`hashtags-${postExternalId}`}>
        Hashtags (comma separated)
        <input id={`hashtags-${postExternalId}`} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#coffee, #smallbusiness" className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-white/60" htmlFor={`cta-${postExternalId}`}>
        CTA
        <input id={`cta-${postExternalId}`} value={cta} onChange={(e) => setCta(e.target.value)} className="w-full rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
      </label>
      <label className="flex items-center gap-2 text-xs font-bold text-white/70">
        <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
        Mark as final variant (required before scheduling)
      </label>
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={update} className="rounded-full bg-[var(--social-blue)] px-4 py-2 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff] disabled:opacity-50">
          Update variant
        </button>
        {result ? <p role="status" className="text-sm text-white/70">{result}</p> : null}
      </div>
      {variants.length > 0 ? (
        <div className="border-t border-white/10 pt-2">
          <p className="text-xs font-bold text-white/50">Current variants returned:</p>
          {variants.map((variant) => (
            <p key={variant.id} className="mt-1 text-xs text-white/60">
              {variant.platform} · {variant.isFinal ? "FINAL" : "draft"} · <code>{variant.title}</code>
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/50">No variants returned yet.</p>
      )}
    </div>
  );
}
