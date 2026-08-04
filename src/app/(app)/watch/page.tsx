import { m2WatchReports, m2WatchPreview } from "@/app/m2-actions";
import { WatchForm } from "@/components/connections/add-destination-form";
import { shellStateLabel } from "@/lib/socialolla/shell/shell";

export const metadata = { title: "Watch — SocialOlla" };

export default async function WatchPage() {
  const preview = await m2WatchPreview();
  const reports = await m2WatchReports();
  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Watch</h1>
      <p className="mt-2 text-white/70">Basic Profile Analysis (provider-disabled). Exact cost preview: {preview.estimatedCredits} credit(s).</p>
      <WatchForm cost={preview.estimatedCredits} batchAvailable={preview.batchAvailable} />
      <div className="mt-6 space-y-3">
        {reports.length === 0 && <p className="text-sm text-white/50">{shellStateLabel("empty")} — no Watch reports yet.</p>}
        {reports.map((r) => (
          <div key={r.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
            <p className="font-bold">{r.externalId}</p>
            <p className="text-sm text-white/60">{r.platform} · {r.status} · cost {r.creditCost} · {r.profileUrl}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
