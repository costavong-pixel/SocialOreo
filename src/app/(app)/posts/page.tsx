import { m2ListPosts, m2Workspace } from "@/app/m2-actions";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { prisma } from "@/lib/db/prisma";
import { shellStateLabel } from "@/lib/socialolla/shell/shell";
import { CreatePostForm } from "@/components/connections/add-destination-form";
import { VariantEditor, type VariantShape } from "@/components/posts/variant-editor";
import { ScheduleControl, type DestinationShape, type OccurrenceShape, type SlotShape } from "@/components/posts/schedule-control";

export const metadata = { title: "Posts — SocialOlla" };

export default async function PostsPage() {
  const workspace = await getOrCreatePersonalWorkspace((await m2Workspace()).ownerAuthUserId);
  const posts = await m2ListPosts();
  const destinations = (await prisma.destination.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { createdAt: "asc" },
  })) as unknown as DestinationShape[];
  const slots = (await prisma.scheduleSlot.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { scheduleAt: "desc" },
    take: 100,
  })) as unknown as SlotShape[];

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Posts</h1>
      <p className="mt-2 text-white/70">Destination-specific Post requests (provider-disabled).</p>
      <div className="mt-6 space-y-3">
        {posts.length === 0 && <p className="text-sm text-white/50">{shellStateLabel("empty")} — create your first Post below.</p>}
        {posts.map((p) => (
          <div key={p.id} className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
            <p className="font-bold">{p.externalId}</p>
            <p className="text-sm text-white/60">status: {p.status} · destination: {p.destinationRef} · language: {p.language}</p>
            <p className="text-sm text-white/60">variants: {p.variants?.length ?? 0} · occurrences: {p.occurrences?.length ?? 0}</p>
            <VariantEditor postExternalId={p.externalId} variants={p.variants as unknown as VariantShape[]} />
            <ScheduleControl
              postExternalId={p.externalId}
              destinationRef={p.destinationRef}
              destinations={destinations}
              occurrences={p.occurrences as unknown as OccurrenceShape[]}
              slots={slots.filter((slot) => slot.destinationRef === p.destinationRef)}
            />
          </div>
        ))}
      </div>
      <CreatePostForm />
    </section>
  );
}
