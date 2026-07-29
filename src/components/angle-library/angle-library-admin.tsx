"use client";

import { AngleStatus } from "@prisma/client";
import { useCallback, useState } from "react";

import {
  angleStatusOptions,
  formatTagList,
  parseTagList,
  type AngleLibraryInput,
  type AngleLibraryRecord,
} from "@/lib/angle-library/types";

type FormState = {
  angleName: string;
  category: string;
  platformFit: string;
  nicheFit: string;
  occasionFit: string;
  goalFit: string;
  tone: string;
  hookFormula: string;
  ctaFormula: string;
  scriptStructure: string;
  shotListPattern: string;
  captionPattern: string;
  riskLevel: string;
  example: string;
  whenToUse: string;
  whenNotToUse: string;
  status: AngleStatus;
  internalOnly: boolean;
};

const emptyForm = (): FormState => ({
  angleName: "",
  category: "promo",
  platformFit: "instagram",
  nicheFit: "food",
  occasionFit: "holiday_promo",
  goalFit: "sales",
  tone: "direct",
  hookFormula: "",
  ctaFormula: "",
  scriptStructure: "",
  shotListPattern: "",
  captionPattern: "",
  riskLevel: "low",
  example: "",
  whenToUse: "",
  whenNotToUse: "",
  status: AngleStatus.DRAFT,
  internalOnly: true,
});

function recordToForm(angle: AngleLibraryRecord): FormState {
  return {
    angleName: angle.angleName,
    category: angle.category,
    platformFit: formatTagList(angle.platformFit),
    nicheFit: formatTagList(angle.nicheFit),
    occasionFit: formatTagList(angle.occasionFit),
    goalFit: formatTagList(angle.goalFit),
    tone: formatTagList(angle.tone),
    hookFormula: angle.hookFormula,
    ctaFormula: angle.ctaFormula ?? "",
    scriptStructure: angle.scriptStructure ?? "",
    shotListPattern: angle.shotListPattern ?? "",
    captionPattern: angle.captionPattern ?? "",
    riskLevel: angle.riskLevel ?? "",
    example: angle.example ?? "",
    whenToUse: angle.whenToUse ?? "",
    whenNotToUse: angle.whenNotToUse ?? "",
    status: angle.status,
    internalOnly: angle.internalOnly,
  };
}

function formToPayload(form: FormState): AngleLibraryInput {
  return {
    angleName: form.angleName,
    category: form.category,
    platformFit: parseTagList(form.platformFit),
    nicheFit: parseTagList(form.nicheFit),
    occasionFit: parseTagList(form.occasionFit),
    goalFit: parseTagList(form.goalFit),
    tone: parseTagList(form.tone),
    hookFormula: form.hookFormula,
    ctaFormula: form.ctaFormula || undefined,
    scriptStructure: form.scriptStructure || undefined,
    shotListPattern: form.shotListPattern || undefined,
    captionPattern: form.captionPattern || undefined,
    riskLevel: form.riskLevel || undefined,
    example: form.example || undefined,
    whenToUse: form.whenToUse || undefined,
    whenNotToUse: form.whenNotToUse || undefined,
    status: form.status,
    internalOnly: form.internalOnly,
  };
}

function statusLabel(status: AngleStatus): string {
  return angleStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function AngleLibraryAdmin({ initialAngles }: { initialAngles: AngleLibraryRecord[] }) {
  const [angles, setAngles] = useState<AngleLibraryRecord[]>(initialAngles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const loadAngles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/angle-library");
      const payload = (await response.json()) as { angles?: AngleLibraryRecord[]; error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not load angles.");
        return;
      }

      setAngles(payload.angles ?? []);
    } catch {
      setError("Network error while loading angles.");
    } finally {
      setLoading(false);
    }
  }, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setError(null);
  }

  function openEditForm(angle: AngleLibraryRecord) {
    setEditingId(angle.id);
    setForm(recordToForm(angle));
    setShowForm(true);
    setError(null);
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = formToPayload(form);
    const url = editingId ? `/api/admin/angle-library/${editingId}` : "/api/admin/angle-library";
    const method = editingId ? "PATCH" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not save angle.");
        return;
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await loadAngles();
    } catch {
      setError("Network error while saving angle.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(angleId: string, status: AngleStatus) {
    setError(null);

    try {
      const response = await fetch(`/api/admin/angle-library/${angleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not update status.");
        return;
      }

      await loadAngles();
    } catch {
      setError("Network error while updating status.");
    }
  }

  return (
    <>
      <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-black/50">Private recommendation inputs</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-5xl">Viral Angle Library</h1>
          <p className="mt-4 max-w-2xl text-black/70">
            Trusted formulas you approve for future recommendations. Public profiles, transcripts, and trend scans never add content here automatically.
          </p>
        </div>
        <button
          className="rounded-full bg-black px-6 py-3 text-sm font-bold text-white"
          onClick={openCreateForm}
          type="button"
        >
          Add a trusted angle
        </button>
      </div>

      {error ? <p className="mt-6 text-sm font-semibold text-red-700">{error}</p> : null}

      {showForm ? (
        <form className="mt-8 grid gap-4 rounded-[2rem] border border-black/10 bg-white/80 p-6 md:p-8" onSubmit={handleSave}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black">{editingId ? "Edit angle" : "New angle"}</h2>
            <button
              className="text-sm font-semibold text-black/60 hover:text-black"
              onClick={() => setShowForm(false)}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold">Angle name</span>
              <input
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, angleName: event.target.value }))}
                required
                value={form.angleName}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Category</span>
              <input
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                required
                value={form.category}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Platform fit (comma-separated)</span>
              <input
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, platformFit: event.target.value }))}
                value={form.platformFit}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Niche fit (comma-separated)</span>
              <input
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, nicheFit: event.target.value }))}
                value={form.nicheFit}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Occasion fit (comma-separated)</span>
              <input
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, occasionFit: event.target.value }))}
                value={form.occasionFit}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Goal fit (comma-separated)</span>
              <input
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, goalFit: event.target.value }))}
                value={form.goalFit}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Tone (comma-separated)</span>
              <input
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))}
                value={form.tone}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Status</span>
              <select
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) =>
                  setForm((current) => ({ ...current, status: event.target.value as AngleStatus }))
                }
                value={form.status}
              >
                {angleStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Hook formula</span>
            <textarea
              className="min-h-24 rounded-2xl border border-black/15 bg-white px-4 py-3"
              onChange={(event) => setForm((current) => ({ ...current, hookFormula: event.target.value }))}
              required
              value={form.hookFormula}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold">CTA formula</span>
              <textarea
                className="min-h-20 rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, ctaFormula: event.target.value }))}
                value={form.ctaFormula}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Script structure</span>
              <textarea
                className="min-h-20 rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, scriptStructure: event.target.value }))}
                value={form.scriptStructure}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Shot list pattern</span>
              <textarea
                className="min-h-20 rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, shotListPattern: event.target.value }))}
                value={form.shotListPattern}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">Caption pattern</span>
              <textarea
                className="min-h-20 rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, captionPattern: event.target.value }))}
                value={form.captionPattern}
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold">Risk level</span>
              <input
                className="rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, riskLevel: event.target.value }))}
                value={form.riskLevel}
              />
            </label>
            <label className="flex items-center gap-3 pt-8">
              <input
                checked={form.internalOnly}
                onChange={(event) => setForm((current) => ({ ...current, internalOnly: event.target.checked }))}
                type="checkbox"
              />
              <span className="text-sm font-bold">Internal only (trusted library)</span>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-bold">Example</span>
            <textarea
              className="min-h-20 rounded-2xl border border-black/15 bg-white px-4 py-3"
              onChange={(event) => setForm((current) => ({ ...current, example: event.target.value }))}
              value={form.example}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold">When to use</span>
              <textarea
                className="min-h-20 rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, whenToUse: event.target.value }))}
                value={form.whenToUse}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold">When not to use</span>
              <textarea
                className="min-h-20 rounded-2xl border border-black/15 bg-white px-4 py-3"
                onChange={(event) => setForm((current) => ({ ...current, whenNotToUse: event.target.value }))}
                value={form.whenNotToUse}
              />
            </label>
          </div>

          <button
            className="rounded-full bg-black px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "Saving…" : editingId ? "Save changes" : "Create angle"}
          </button>
        </form>
      ) : null}

      <div className="mt-8 grid gap-4">
        {loading ? <p className="text-black/60">Loading angles…</p> : null}
        {!loading && angles.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-black/15 bg-white/50 p-8 text-center">
            <p className="font-semibold text-black/70">No trusted angles yet.</p>
            <p className="mt-2 text-sm text-black/55">Public audits never fill this library automatically.</p>
            <p className="mt-2 text-sm text-black/55">Add a formula only after you have reviewed and approved it, then mark it Active when future recommendations may use it.</p>
          </div>
        ) : null}

        {angles.map((angle) => (
          <article key={angle.id} className="rounded-[1.5rem] border border-black/10 bg-white/70 p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black tracking-[-0.02em]">{angle.angleName}</h2>
                  <span className="rounded-full bg-black/[0.06] px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-black/60">
                    {statusLabel(angle.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-black/55">
                  {angle.category} · {formatTagList(angle.goalFit)}
                </p>
                <p className="mt-4 text-black/80">{angle.hookFormula}</p>
                {angle.ctaFormula ? <p className="mt-2 text-sm text-black/65">CTA: {angle.ctaFormula}</p> : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-black/15 px-4 py-2 text-sm font-bold"
                  onClick={() => openEditForm(angle)}
                  type="button"
                >
                  Edit
                </button>
                {angle.status !== AngleStatus.ACTIVE ? (
                  <button
                    className="rounded-full border border-black/15 px-4 py-2 text-sm font-bold"
                    onClick={() => void updateStatus(angle.id, AngleStatus.ACTIVE)}
                    type="button"
                  >
                    Activate
                  </button>
                ) : null}
                {angle.status !== AngleStatus.ARCHIVED ? (
                  <button
                    className="rounded-full border border-black/15 px-4 py-2 text-sm font-bold"
                    onClick={() => void updateStatus(angle.id, AngleStatus.ARCHIVED)}
                    type="button"
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
