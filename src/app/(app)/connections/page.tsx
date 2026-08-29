import Link from "next/link";

import { m2Workspace } from "@/app/m2-actions";
import { prisma } from "@/lib/db/prisma";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";

export const metadata = { title: "Connections — SocialOlla" };

const SUPPORTED_CONNECTIONS = [
  { name: "Instagram", description: "Publishing and Profile Analysis connections." },
  { name: "TikTok", description: "Publishing connections when provider access is enabled." },
] as const;

export default async function ConnectionsPage() {
  const workspace = await m2Workspace();
  const destinations = await prisma.destination.findMany({ where: { workspaceId: workspace.dbId }, orderBy: { createdAt: "asc" } });
  const publishingDisabled = providerDisabledEnabled();

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Connections</h1>
      <p className="mt-2 text-white/70">Manage the social accounts used by Posts and Profile Analysis.</p>
      <div className="mt-6 rounded-3xl border border-amber-200/25 bg-amber-200/10 p-5">
        <p className="font-bold text-amber-100">Staging notice</p>
        <p className="mt-1 text-sm text-white/70">
          {publishingDisabled
            ? "Live social OAuth connections are not enabled in this staging environment. No live account connection is being claimed."
            : "Instagram publishing connections are OAuth-backed and destination-scoped."}
        </p>
        {!publishingDisabled && (
          <Link href="/api/meta/instagram/publish/connect" className="mt-4 inline-flex rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)]">
            Connect Instagram for publishing
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {SUPPORTED_CONNECTIONS.map((connection) => (
          <article key={connection.name} className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-extrabold">{connection.name}</h2>
              <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/60">Not connected</span>
            </div>
            <p className="mt-3 text-sm text-white/65">{connection.description}</p>
            <p className="mt-2 text-xs text-white/45">{publishingDisabled ? "Connection setup is unavailable in staging." : "Connection setup is available for approved provider access."}</p>
          </article>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Connected accounts</h2>
        {destinations.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">No social accounts connected yet. Connect an account when OAuth setup is available.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {destinations.map((destination) => {
              const instagram = destination.platform.toLowerCase() === "instagram";
              return (
                <div key={destination.id} className="rounded-2xl border border-white/5 p-4">
                  <p className="font-bold">{destination.label}</p>
                  <p className="text-sm text-white/60">{destination.platform} · {destination.accountLabel ?? ""} · {destination.status}</p>
                  {instagram && <p className="text-xs text-white/45">Publishing token: {destination.accessTokenCiphertext ? "encrypted" : "absent"} · eligibility: {destination.publishingEligibilityVerifiedAt ? "verified" : "unverified"}</p>}
                  {destination.status === "REAUTH_REQUIRED" && !publishingDisabled && <Link href="/api/meta/instagram/publish/connect" className="mt-2 inline-block text-sm font-bold text-amber-200">Reconnect Instagram</Link>}
                  <p className="mt-1 text-xs text-amber-100/70">{publishingDisabled ? "Staging test connection — live delivery is unavailable." : "Provider connection state is recorded for this workspace."}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
