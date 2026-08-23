import { redirect } from "next/navigation";
import Link from "next/link";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { prisma } from "@/lib/db/prisma";
import { translate } from "@/lib/socialolla/i18n/translations";
import { CreatePostForm } from "@/components/connections/add-destination-form";

export const metadata = { title: "Dashboard — SocialOlla" };

const LOCALE = "en-US";

export default async function M2HomePage() {
  const sessionUser = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(sessionUser)) redirect("/account-conflict");
  if (!sessionUser) redirect("/auth/login");

  const workspace = await getOrCreatePersonalWorkspace(sessionUser.dbId);
  const destinations = await prisma.destination.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { createdAt: "asc" },
  });
  const posts = await prisma.postRequest.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { variants: true, occurrences: true },
  });
  const upcoming = await prisma.scheduleSlot.findMany({
    where: { workspaceId: workspace.dbId, scheduleAt: { gte: new Date() } },
    orderBy: { scheduleAt: "asc" },
    take: 5,
  });

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Dashboard</h1>
      <p className="mt-2 text-white/70">Workspace <code>{workspace.id}</code> · {translate(LOCALE, "onboarding.sevenDayPlan")} overview</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="font-display text-lg font-extrabold">Destinations</h2>
          <p className="mt-2 text-3xl font-black">{destinations.length}</p>
          <p className="text-sm text-white/50">{destinations.length === 0 ? "No sandbox destinations yet." : "Provider-disabled sandbox connections."}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="font-display text-lg font-extrabold">Posts</h2>
          <p className="mt-2 text-3xl font-black">{posts.length}</p>
          <p className="text-sm text-white/50">Destination-specific Post requests.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
          <h2 className="font-display text-lg font-extrabold">Upcoming</h2>
          <p className="mt-2 text-3xl font-black">{upcoming.length}</p>
          <p className="text-sm text-white/50">Scheduled occurrences in the next period.</p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Recent posts</h2>
        {posts.length === 0 && <p className="mt-2 text-sm text-white/50">No posts yet. Create your first provider-disabled Post.</p>}
        <div className="mt-3 space-y-2">
          {posts.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-2xl border border-white/5 p-3">
              <div>
                <p className="font-bold">{p.externalId}</p>
                <p className="text-xs text-white/50">{p.status} · {p.destinationRef} · {p.language}</p>
              </div>
              <Link className="text-sm font-bold text-[var(--social-blue)] hover:underline" href="/posts">View</Link>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <CreatePostForm />
      </div>
    </section>
  );
}
