import { NewAuditForm } from "@/components/audit/new-audit-form";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { ProductFrame } from "@/components/layout/product-frame";

export default async function NewAuditPage() {
  const user = await getSessionUser();
  const isAdmin = user ? await requireAdminByAuthUserId(user.id) : false;

  return (
    <ProductFrame backHref={user ? "/dashboard" : "/"} backLabel={user ? "Workspace" : "Home"} maxWidth="narrow" utility={user ? <a href="/auth/logout">Sign out</a> : undefined}>
      <section className="so-task-form">
        {!user ? (
          <div className="mt-10 rounded-2xl border border-[var(--social-line-dark)] bg-[var(--social-surface)] p-6 md:p-10">
            <h1 className="font-display text-3xl font-extrabold tracking-[-0.04em]">Sign in to start an audit</h1>
            <p className="mt-4 text-[var(--social-muted-on-dark)]">
              SocialOreo audits require an account so we can save your campaign brief and report.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a className="rounded-full bg-[var(--social-blue)] px-6 py-3 text-center text-sm font-bold text-[var(--social-ink)] transition hover:bg-[#cdbbff]" href="/auth/login">
                Sign in
              </a>
              <a className="rounded-full border border-[var(--social-line-dark)] px-6 py-3 text-center text-sm font-bold transition hover:border-[var(--social-blue)]" href="/auth/login?screen_hint=signup">
                Create account
              </a>
            </div>
          </div>
        ) : (
          <NewAuditForm isAdmin={isAdmin} />
        )}
      </section>
    </ProductFrame>
  );
}
