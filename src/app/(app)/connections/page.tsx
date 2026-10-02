import Link from "next/link";

import { m2DisconnectInstagramDestination, m2Workspace } from "@/app/m2-actions";
import { prisma } from "@/lib/db/prisma";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { CONNECTION_REGISTRY } from "@/lib/socialolla/connections/registry";
import { connectionAvailable } from "@/lib/socialolla/connections/service";
import { ConnectionCard } from "@/components/connections/connection-card";
import { instagramConnectionOAuthEnabled } from "@/lib/socialolla/publishing/provider";

export const metadata = { title: "Connections — SocialOlla" };

export default async function ConnectionsPage() {
  const workspace = await m2Workspace();
  const destinations = await prisma.destination.findMany({ where: { workspaceId: workspace.dbId }, orderBy: { createdAt: "asc" } });
  const publishingDisabled = providerDisabledEnabled();
  const instagramConnectionAvailable = instagramConnectionOAuthEnabled();
  const destinationByPlatform = new Map(destinations.map((destination) => [destination.platform.toLowerCase(), destination]));

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Connections</h1>
      <p className="mt-2 text-white/70">Manage the social accounts used by Posts and Profile Analysis.</p>
      <div className="mt-6 rounded-3xl border border-amber-200/25 bg-amber-200/10 p-5">
        <p className="font-bold text-amber-100">Staging notice</p>
        <p className="mt-1 text-sm text-white/70">
          {publishingDisabled
            ? "Live social OAuth connections are not enabled in this environment. No live account connection is being claimed."
            : "Connections use one server-side, destination-scoped OAuth flow; provider publishing remains separately gated."}
        </p>
        {instagramConnectionAvailable && (
          <Link href="/api/meta/instagram/publish/connect" className="mt-4 inline-flex rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)]">
            Connect Instagram
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {CONNECTION_REGISTRY.map((descriptor) => <ConnectionCard key={descriptor.platform} descriptor={descriptor} status={destinationByPlatform.get(descriptor.platform)?.status ?? "NOT_CONNECTED"} actionHref={descriptor.platform === "instagram" && instagramConnectionAvailable ? "/api/meta/instagram/publish/connect" : connectionAvailable(descriptor.platform) ? `/api/connections/${descriptor.platform}/connect` : undefined} />)}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Connected accounts</h2>
        {destinations.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">No social accounts connected yet. Connect an account when OAuth setup is available.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {destinations.map((destination) => {
              const instagram = destination.platform.toLowerCase() === "instagram";
              const connectionPath = `/api/connections/${destination.platform.toLowerCase()}/disconnect`;
              return (
                <div key={destination.id} className="rounded-2xl border border-white/5 p-4">
                  <p className="font-bold">{destination.label}</p>
                  <p className="text-sm text-white/60">{destination.platform} · {destination.accountLabel ?? ""} · {destination.status}</p>
                  {instagram && <p className="text-xs text-white/45">Publishing token: {destination.accessTokenCiphertext ? "encrypted" : "absent"} · eligibility: {destination.publishingEligibilityVerifiedAt ? "verified" : "unverified"}</p>}
                  {destination.status === "REAUTH_REQUIRED" && (instagram ? instagramConnectionAvailable : !publishingDisabled) && <Link href={instagram ? "/api/meta/instagram/publish/connect" : `/api/connections/${destination.platform.toLowerCase()}/connect`} className="mt-2 inline-block text-sm font-bold text-amber-200">Reconnect {destination.platform}</Link>}
                  {destination.status === "DISCONNECTED" && (instagram ? instagramConnectionAvailable : !publishingDisabled) && <Link href={instagram ? "/api/meta/instagram/publish/connect" : `/api/connections/${destination.platform.toLowerCase()}/connect`} className="mt-2 inline-block text-sm font-bold text-amber-200">Reconnect {destination.platform}</Link>}
                  {!destination.providerDisabled && destination.status === "CONNECTED" && (
                    <form action={instagram ? m2DisconnectInstagramDestination : connectionPath} className="mt-3">
                      <input type="hidden" name="destinationExternalId" value={destination.externalId} />
                      <button type="submit" className="rounded-full border border-red-200/30 px-3 py-1.5 text-xs font-bold text-red-100" aria-label={`Disconnect ${destination.label}`}>
                        Disconnect
                      </button>
                    </form>
                  )}
                  <p className="mt-1 text-xs text-amber-100/70">
                    {destination.providerDisabled
                      ? "Provider-disabled staging test data — no live account or delivery is claimed."
                      : publishingDisabled
                        ? "Live delivery is currently disabled in this staging environment."
                        : "Live provider connection state is recorded for this workspace."}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
