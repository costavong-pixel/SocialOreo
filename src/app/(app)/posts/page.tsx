import { m2ListPosts, m2Workspace } from "@/app/m2-actions";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { prisma } from "@/lib/db/prisma";
import { shellStateLabel } from "@/lib/socialolla/shell/shell";
import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { CreatePostForm } from "@/components/connections/add-destination-form";
import { VariantEditor, type VariantShape } from "@/components/posts/variant-editor";
import { ScheduleControl, type DestinationShape, type OccurrenceShape, type SlotShape } from "@/components/posts/schedule-control";
import { PublishButton } from "@/components/posts/publish-button";
import { createLocalPrivateMediaStorage } from "@/lib/socialolla/media/local-storage";
import { toDestinationView } from "@/lib/socialolla/publishing/destination-view";

export const metadata = { title: "Posts — SocialOlla" };

export default async function PostsPage() {
  const workspace = await getOrCreatePersonalWorkspace((await m2Workspace()).ownerAuthUserId);
  const posts = await m2ListPosts();
  const mediaIds = [...new Set(posts.flatMap((post) => post.variants.flatMap((variant) => variant.mediaAssetIds)))];
  const mediaRows = mediaIds.length ? await prisma.mediaAsset.findMany({ where: { workspaceId: workspace.dbId, externalId: { in: mediaIds }, status: "READY" } }) : [];
  const mediaPreviewUrls = new Map<string, string>();
  for (const media of mediaRows) {
    try {
      const grant = await createLocalPrivateMediaStorage().createControlledReadGrant({ descriptor: { assetId: media.externalId, ownerWorkspaceId: workspace.id, kind: media.kind as "image" | "video", mimeType: media.mimeType, detectedMimeType: media.detectedMimeType, sizeBytes: media.sizeBytes, originalName: media.originalName, storageKey: media.storageKey }, expiresInSeconds: 120 });
      mediaPreviewUrls.set(media.externalId, grant.grant);
    } catch {
      // APP_URL is required for provider publishing; leave preview explicitly
      // unavailable when local development has not configured it.
    }
  }
  const destinationRows = await prisma.destination.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { createdAt: "asc" },
    // Never pass a full Prisma Destination row to a client component. In
    // particular, accessTokenCiphertext, scopes, and platformUserId are
    // server-only provider fields.
    select: { externalId: true, label: true, platform: true, status: true, providerDisabled: true },
  });
  const destinations: DestinationShape[] = destinationRows.map(toDestinationView);
  const slots = (await prisma.scheduleSlot.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { scheduleAt: "desc" },
    take: 100,
  })) as unknown as SlotShape[];

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Posts</h1>
      <p className="mt-2 text-white/70">Create and review Posts for your connected social accounts.</p>
      <div className="mt-6 space-y-3">
        {posts.length === 0 && <p className="text-sm text-white/50">{shellStateLabel("empty")} — create your first Post below.</p>}
        {posts.map((p) => (
          <div key={p.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
            <p className="font-bold">{p.externalId}</p>
            <p className="text-sm text-white/60">status: {p.status} · destination: {destinations.find((d) => d.externalId === p.destinationRef)?.label ?? "Connected account"} · language: {p.language}</p>
            <p className="text-sm text-white/60">variants: {p.variants?.length ?? 0} · occurrences: {p.occurrences?.length ?? 0}</p>
            <div className="mt-2 flex flex-wrap gap-2">{p.variants.flatMap((variant) => variant.mediaAssetIds.map((assetId) => mediaPreviewUrls.get(assetId) ? <img key={assetId} src={mediaPreviewUrls.get(assetId)} alt="Post media" className="h-16 w-16 rounded-xl object-cover" /> : <span className="rounded-lg border border-amber-300/30 px-2 py-1 text-xs text-amber-200" key={assetId}>Media preview unavailable</span>))}</div>
            {p.destinations?.map((target) => target.publishJobs.map((job) => <p className="mt-1 text-xs text-white/60" key={job.id}>Instagram delivery · {job.status}{job.receipt?.providerObjectId ? " · provider receipt recorded" : ""}</p>))}
            <VariantEditor postExternalId={p.externalId} variants={p.variants as unknown as VariantShape[]} />
            <PublishButton postRequestExternalId={p.externalId} />
            <ScheduleControl
              postExternalId={p.externalId}
              destinationRef={p.destinationRef}
              destinations={destinations}
              occurrences={p.occurrences as unknown as OccurrenceShape[]}
              slots={slots.filter((slot) => slot.destinationRef === p.destinationRef)}
              providerDisabled={providerDisabledEnabled()}
            />
          </div>
        ))}
      </div>
      <CreatePostForm destinations={destinations} />
    </section>
  );
}
