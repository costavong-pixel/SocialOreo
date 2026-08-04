import { m2Workspace } from "@/app/m2-actions";
import { OnboardingProfileReview } from "@/components/onboarding/profile-review";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { OnboardingFirstPostForm } from "@/components/connections/add-destination-form";

export const metadata = { title: "Onboarding — SocialOlla" };

export default async function OnboardingPage() {
  const sessionUser = await getVerifiedSessionUser();
  if (!sessionUser) redirect("/auth/login");

  const workspace = await m2Workspace();
  const workspaceDb = await getOrCreatePersonalWorkspace(sessionUser.id);
  const plans = await prisma.sevenDayPlan.findMany({
    where: { workspaceId: workspaceDb.dbId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const destinations = await prisma.destination.findMany({
    where: { workspaceId: workspaceDb.dbId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Set up your workspace</h1>
      <p className="mt-2 text-white/70">Workspace: <code>{workspace.id}</code></p>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Conversational purpose intake</h2>
        <p className="mt-1 text-sm text-white/60">Describe your business. Suggested fields are proposals only — accept, edit, reject or skip each one. Nothing is invented.</p>
        <div className="mt-4">
          <OnboardingProfileReview />
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Seven-day plan</h2>
        <div className="mt-3">
          <OnboardingFirstPostForm
            destinations={destinations.map((d) => ({ externalId: d.externalId, label: d.accountLabel || d.label, platform: d.platform }))}
          />
        </div>
        {plans.length === 0 ? (
          <p className="mt-2 text-sm text-white/50">No seven-day plan yet. Approve your profile, add a sandbox destination, then create your first Post to generate a plan.</p>
        ) : (          <div className="mt-3 space-y-3">
            {plans.map((plan) => {
              const items = Array.isArray(plan.planJson) ? (plan.planJson as Array<{ day: number; topic: string; status?: string }>) : [];
              return (
                <div key={plan.id} className="rounded-2xl border border-white/5 p-4">
                  <p className="text-xs text-white/50">Plan · {plan.destinationRef} · {plan.createdAt.toISOString().slice(0, 10)}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/80">
                    {items.map((item, index) => (
                      <li key={index}>Day {item.day}: {item.topic}{item.status ? ` — ${item.status}` : ""}</li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Next steps</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/80">
          <li>Approve your profile and review the proposed fields.</li>
          <li>Connect a sandbox Instagram/TikTok destination (Connections).</li>
          <li>Create your first destination-specific Post and seven-day plan.</li>
          <li>Post variants stay light drafts until you approve and schedule.</li>
        </ol>
      </div>
    </section>
  );
}
