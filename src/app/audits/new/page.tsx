import { NewAuditForm } from "@/components/audit/new-audit-form";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { evaluateServerMonthlyAvailability } from "@/lib/payments/square/monthly-availability";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";
import { permanentRedirect, redirect } from "next/navigation";

/** Canonical SocialOlla Profile Analysis creation surface. */
export async function AnalysisNewPage() {
  const sessionUser = await getVerifiedSessionUser();
  const resolution = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(resolution)) redirect("/account-conflict");
  if (!sessionUser || !resolution) redirect("/auth/login");

  // This is a lazy, per-user workspace resolution already used by the
  // canonical shell. It does not migrate historical credit or entitlement data.
  await getOrCreatePersonalWorkspace(resolution.dbId);
  const isAdmin = await requireAdminByAuthUserId(resolution.authUserId);
  const monthlyAvailable = (await evaluateServerMonthlyAvailability(sessionUser, isAdmin)).available;

  return (
    <section className="so-task-form">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--social-blue)]">Profile Analysis</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.04em]">Create a profile analysis</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/65">Analyze a public Instagram or TikTok profile and turn the evidence into a practical content plan.</p>
      </div>
      <NewAuditForm isAdmin={isAdmin} monthlyAvailable={monthlyAvailable} />
    </section>
  );
}

/** Compatibility route: Profile Analysis now lives at /analysis/new. */
export default function NewAuditPage() {
  permanentRedirect("/analysis/new");
}
