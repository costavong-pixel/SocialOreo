import { redirect } from "next/navigation";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { prisma } from "@/lib/db/prisma";
import { shellStateLabel } from "@/lib/socialolla/shell/shell";

export const metadata = { title: "Calendar — SocialOlla" };

type DayPlanItem = { day: number; topic: string; status?: string };

export default async function M2CalendarPage() {
  const sessionUser = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(sessionUser)) redirect("/account-conflict");
  if (!sessionUser) redirect("/auth/login");

  const workspace = await getOrCreatePersonalWorkspace(sessionUser.dbId);
  const slots = await prisma.scheduleSlot.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { scheduleAt: "asc" },
    take: 200,
  });
  const plans = await prisma.sevenDayPlan.findMany({
    where: { workspaceId: workspace.dbId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const byDay = new Map<string, typeof slots>();
  for (const slot of slots) {
    const day = slot.scheduleAt.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? [];
    bucket.push(slot);
    byDay.set(day, bucket);
  }
  const days = [...byDay.entries()];

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Calendar</h1>
      <p className="mt-2 text-white/70">Seven-day plan and scheduled Posts.</p>
      <p className="mt-3 rounded-2xl border border-amber-200/20 bg-amber-200/10 px-4 py-3 text-sm text-amber-100/80">Staging notice: the calendar records your saved schedule; live social delivery is not enabled here.</p>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Seven-day plan</h2>
        {plans.length === 0 ? (
          <p className="mt-2 text-sm text-white/50">{shellStateLabel("empty")} — no seven-day plan yet. Approve your profile, add a destination, then create your first Post.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {plans.map((plan) => {
              const items = Array.isArray(plan.planJson) ? (plan.planJson as DayPlanItem[]) : [];
              return (
                <div key={plan.id} className="rounded-2xl border border-white/5 p-4">
                  <p className="text-xs text-white/50">Plan · {plan.destinationRef} · {plan.createdAt.toISOString().slice(0, 10)}</p>
                  <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((item) => (
                      <li key={item.day} className={`rounded-2xl border p-3 ${item.day === 1 ? "border-[var(--social-blue)]/50 bg-[var(--social-blue)]/10" : "border-white/10 bg-white/[0.02]"}`}>
                        <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--social-blue)]">Day {item.day}</p>
                        <p className="mt-1 text-sm font-bold text-white/85">{item.topic}</p>
                        <p className="mt-1 text-xs text-white/50">{item.status ?? "idea"}{item.day === 1 ? " · first-post draft" : ""}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="font-display text-lg font-extrabold">Scheduled occurrences</h2>
        {days.length === 0 && <p className="mt-2 text-sm text-white/60">{shellStateLabel("empty")} — no scheduled occurrences yet. Approve and schedule a Post to populate the calendar.</p>}
        <div className="mt-3 space-y-4">
          {days.map(([day, daySlots]) => (
            <div key={day}>
              <h3 className="font-display text-base font-extrabold">{day}</h3>
              <div className="mt-2 space-y-2">
                {daySlots.map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between rounded-2xl border border-white/5 p-3">
                    <div>
                      <p className="font-bold">{slot.destinationRef}</p>
                      <p className="text-xs text-white/50">Scheduled Post · {slot.timezone}</p>
                    </div>
                    <p className="text-sm font-bold text-white/80">{slot.scheduleAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
