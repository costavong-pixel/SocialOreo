import { m2WatchMonitors, m2WatchReports, m2WatchPreview } from "@/app/m2-actions";
import { WatchForm } from "@/components/connections/add-destination-form";
import { WatchMonitorForm } from "@/components/watch/watch-monitor-form";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { shellStateLabel } from "@/lib/socialolla/shell/shell";

export const metadata = { title: "Watch — SocialOlla" };

export default async function WatchPage() {
  const [preview, reports, monitors] = await Promise.all([m2WatchPreview(), m2WatchReports(), m2WatchMonitors()]);
  const providerDisabled = providerDisabledEnabled();
  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Watch</h1>
      <p className="mt-2 text-white/70">Monitor a public competitor profile with an exact credit preview. {providerDisabled ? "Live monitoring is disabled in this staging environment." : "Live monitoring is available only through the configured staging provider."}</p>
      <WatchMonitorForm cost={preview.estimatedCredits} providerDisabled={providerDisabled} monitors={monitors} />
      <h2 className="mt-8 font-display text-lg font-extrabold">One-off Watch report</h2>
      <WatchForm cost={preview.estimatedCredits} batchAvailable={preview.batchAvailable} providerDisabled={providerDisabled} />
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
