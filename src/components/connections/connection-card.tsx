import type { ConnectionDescriptor } from "@/lib/socialolla/connections/registry";

export function ConnectionCard({ descriptor, status, actionHref }: { descriptor: ConnectionDescriptor; status: string; actionHref?: string }) {
  const label = status === "CONNECTED" ? "Connected" : status === "REAUTH_REQUIRED" ? "Reauth required" : descriptor.availability === "APPROVAL_REQUIRED" ? "API approval required" : "Not connected";
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">{descriptor.name}</h2>
        <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{label}</span>
      </div>
      <p className="mt-3 text-sm text-white/65">{descriptor.description}</p>
      <p className="mt-2 text-xs text-white/45">{descriptor.availability === "APPROVAL_REQUIRED" ? "Provider approval and credentials are required before OAuth can be enabled." : "OAuth connection is destination-scoped and server-side."}</p>
      {actionHref && label !== "Connected" ? <a href={actionHref} className="mt-4 inline-flex rounded-full bg-[var(--social-blue)] px-4 py-2 text-xs font-extrabold text-[var(--social-ink)]">Connect {descriptor.name}</a> : null}
    </article>
  );
}
