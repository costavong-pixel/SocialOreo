import { redirect } from "next/navigation";

import { m2RequireAdmin } from "@/app/m2-actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { listAuthSessionLog } from "@/lib/auth/session-audit-view";

export const metadata = { title: "Admin — Session log — SocialOlla" };

function roleLabel(role: "USER" | "ADMIN" | null): string {
  if (role === "ADMIN") return "Admin";
  if (role === "USER") return "User";
  return "Unresolved";
}

function verifiedLabel(value: boolean | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Unavailable";
}

export default async function AdminSessionsPage() {
  const { admin } = await m2RequireAdmin();
  if (!admin) redirect("/home");

  const sessions = await listAuthSessionLog(200);

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Admin — Session log</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/65">
        Security-playbook view of Auth0 session-establishment evidence. It shows which canonical account currently maps to the login identity, whether Auth0 reported the email as verified, and whether the account is currently a User or Admin.
      </p>

      <div className="mt-4">
        <AdminNav />
      </div>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.02]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.1em] text-white/50">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Signed-in account</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">email_verified</th>
              <th className="px-4 py-3">Connection</th>
              <th className="px-4 py-3">Environment / revision</th>
              <th className="px-4 py-3">Session ref</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-white/50" colSpan={7}>No authentication session events recorded.</td>
              </tr>
            ) : sessions.map((session) => (
              <tr key={session.id} className="border-b border-white/10 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 text-white/65">{session.occurredAt.toISOString()}</td>
                <td className="px-4 py-3">
                  <p className="font-bold text-white/90">{session.accountEmail ?? "Account not resolved"}</p>
                  <p className="mt-1 text-xs text-white/45">Ref: {session.accountReference}</p>
                </td>
                <td className="px-4 py-3 font-bold text-[var(--social-blue)]">{roleLabel(session.accountRole)}</td>
                <td className={`px-4 py-3 font-bold ${session.providerEmailVerified === false ? "text-amber-200" : "text-white/80"}`}>
                  {verifiedLabel(session.providerEmailVerified)}
                </td>
                <td className="px-4 py-3 text-white/65">{session.connectionProvider ?? "Unavailable"}</td>
                <td className="px-4 py-3 text-white/65">
                  <p>{session.environment ?? "Unavailable"}</p>
                  <p className="mt-1 max-w-48 truncate text-xs text-white/45">{session.revision ?? "revision unavailable"}</p>
                </td>
                <td className="px-4 py-3 text-xs text-white/55">
                  <p className="max-w-48 truncate">{session.sessionRef ?? "Unavailable"}</p>
                  {session.sessionRefSource ? <p className="mt-1 text-white/35">source: {session.sessionRefSource}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/45">
        Role is the account&apos;s current database role at the time this page is viewed; it is not a historical role-at-login claim. Raw Auth0 subjects, tokens, cookies, raw session IDs, IP addresses, and user-agent strings are not displayed here.
      </p>
    </section>
  );
}
