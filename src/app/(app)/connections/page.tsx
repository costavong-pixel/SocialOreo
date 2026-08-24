import { m2Workspace } from "@/app/m2-actions";
import { prisma } from "@/lib/db/prisma";
import { shellStateLabel } from "@/lib/socialolla/shell/shell";
import Link from "next/link";

export const metadata = { title: "Connections — SocialOlla" };

export default async function ConnectionsPage() {
  const workspace = await m2Workspace();
  const destinations = await prisma.destination.findMany({ where: { workspaceId: workspace.dbId }, orderBy: { createdAt: "asc" } });
  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Connections</h1>
      <p className="mt-2 text-white/70">Instagram publishing connections are OAuth-backed and destination-scoped.</p>
      <Link href="/api/meta/instagram/publish/connect" className="mt-4 inline-flex rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)]">Connect Instagram for publishing</Link>
      <div className="mt-6 space-y-3">
        {destinations.length === 0 && <p className="text-sm text-white/50">{shellStateLabel("empty")} — connect the staging Instagram account above.</p>}
        {destinations.map((d) => (
          <div key={d.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
            <p className="font-bold">{d.label}</p>
            <p className="text-sm text-white/60">{d.platform} · {d.accountLabel ?? ""} · {d.status} · {d.providerDisabled ? "publishing disabled" : "publishing enabled"}</p>
            {d.platform === "instagram" && <p className="text-xs text-white/45">Scopes: {d.scopes.length ? d.scopes.join(", ") : "none recorded"} · token: {d.accessTokenCiphertext ? "encrypted" : "absent"} · publishing eligibility: {d.publishingEligibilityVerifiedAt ? "verified" : "unverified"}</p>}
            {d.status === "REAUTH_REQUIRED" && <Link href="/api/meta/instagram/publish/connect" className="mt-2 inline-block text-sm font-bold text-amber-200">Reconnect Instagram</Link>}
          </div>
        ))}
      </div>
    </section>
  );
}
