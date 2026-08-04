import { m2Workspace } from "@/app/m2-actions";
import { prisma } from "@/lib/db/prisma";
import { shellStateLabel } from "@/lib/socialolla/shell/shell";
import { AddDestinationForm } from "@/components/connections/add-destination-form";

export const metadata = { title: "Connections — SocialOlla" };

export default async function ConnectionsPage() {
  const workspace = await m2Workspace();
  const destinations = await prisma.destination.findMany({ where: { workspaceId: workspace.dbId }, orderBy: { createdAt: "asc" } });
  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Connections</h1>
      <p className="mt-2 text-white/70">Labelled provider-disabled Instagram/TikTok destinations.</p>
      <div className="mt-6 space-y-3">
        {destinations.length === 0 && <p className="text-sm text-white/50">{shellStateLabel("empty")} — add your first sandbox destination below.</p>}
        {destinations.map((d) => (
          <div key={d.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
            <p className="font-bold">{d.label}</p>
            <p className="text-sm text-white/60">{d.platform} · {d.accountLabel ?? ""} · {d.status} · provider-disabled</p>
          </div>
        ))}
      </div>
      <AddDestinationForm />
    </section>
  );
}
