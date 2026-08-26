import Link from "next/link";

import type { ProfileContext } from "@/lib/socialolla/profile/profile-context";

function roleLabel(role: ProfileContext["role"]): string {
  if (role === "ADMIN") return "Admin";
  if (role === "USER") return "User";
  return "Unavailable";
}

function acceptanceLabel(state: ProfileContext["acceptanceBootstrapState"]): string {
  if (state === "active") return "Approved";
  if (state === "recorded-disabled") return "Recorded (override disabled)";
  return "Not active";
}

function Detail({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/10 py-3 last:border-b-0 sm:grid sm:grid-cols-[minmax(10rem,0.8fr)_1fr] sm:items-center sm:gap-4">
      <dt className="text-sm font-bold text-white/70">{label}</dt>
      <dd data-testid={testId} className="text-sm text-white/95">{value}</dd>
    </div>
  );
}

export function ProfileContextView({ context }: { context: ProfileContext }) {
  const displayName = context.displayName || context.email || "SocialOlla account";
  const isStaging = context.environment === "Staging";

  return (
    <section data-testid="profile-account-context" className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--social-blue)]">Account context</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.04em]">Profile</h1>
        <p className="mt-2 max-w-2xl text-white/70">Confirm who is signed in and which SocialOlla workspace is active.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="profile-account-heading">
          <h2 id="profile-account-heading" className="font-display text-lg font-extrabold">Account</h2>
          <dl className="mt-3">
            <Detail label="Display name" value={displayName} testId="profile-display-name" />
            <Detail label="Email" value={context.email ?? "Email unavailable"} testId="profile-email" />
            <Detail label="Auth provider" value={context.authProvider} testId="profile-auth-provider" />
            <Detail label="Provider email verified" value={context.emailVerified ? "Yes" : "No"} testId="profile-email-verified" />
            <Detail label="Role" value={roleLabel(context.role)} testId="profile-role" />
            <Detail label="Account reference" value={context.supportReference} testId="profile-support-reference" />
          </dl>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="profile-workspace-heading">
          <h2 id="profile-workspace-heading" className="font-display text-lg font-extrabold">Workspace</h2>
          <dl className="mt-3">
            <Detail label="Workspace" value={context.workspaceLabel ?? "Not set up yet"} testId="profile-workspace-label" />
            <Detail label="Current plan" value={context.plan} testId="profile-plan" />
            <Detail label="Credit balance" value={`${context.creditBalance} credits`} testId="profile-credit-balance" />
            <Detail label="Language" value={context.locale ?? "Not set"} testId="profile-locale" />
            <Detail label="Timezone" value={context.timezone ?? "Not set"} testId="profile-timezone" />
          </dl>
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="profile-connections-heading">
        <h2 id="profile-connections-heading" className="font-display text-lg font-extrabold">Connected accounts</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {context.connections.map((connection) => (
            <div key={connection.platform} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
              <p className="font-bold">{connection.platform}</p>
              <p data-testid={`profile-connection-${connection.platform.toLowerCase()}`} className="mt-1 text-sm text-white/70">{connection.status}</p>
            </div>
          ))}
        </div>
        <Link className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white/80 hover:bg-white/10" href="/connections">
          Manage connections
        </Link>
      </section>

      {isStaging ? (
        <section className="rounded-3xl border border-amber-200/20 bg-amber-200/10 p-5" aria-labelledby="profile-staging-heading">
          <h2 id="profile-staging-heading" className="font-display text-lg font-extrabold text-amber-50">Staging context</h2>
          <dl className="mt-3">
            <Detail label="Environment" value="Staging" testId="profile-environment" />
            <Detail label="Provider mode" value={context.providerMode} testId="profile-provider-mode" />
            <Detail label="Staging acceptance" value={acceptanceLabel(context.acceptanceBootstrapState)} testId="profile-staging-acceptance" />
            <Detail label="Staging acceptance override" value={context.acceptanceBootstrapState === "active" ? "Active" : "Not active"} testId="profile-staging-override" />
          </dl>
        </section>
      ) : null}

      <p className="text-sm text-white/60">Need help? Share the account reference above with SocialOlla support. It cannot be used to sign in.</p>
    </section>
  );
}
