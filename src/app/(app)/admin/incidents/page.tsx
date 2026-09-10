import { redirect } from "next/navigation";

import { m2RequireAdmin } from "@/app/m2-actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { listCustomerIncidentLog } from "@/lib/observability/customer-incident-view";

export const metadata = { title: "Admin — Customer incidents — SocialOlla" };

function roleLabel(role: "USER" | "ADMIN" | null): string {
  if (role === "ADMIN") return "Admin";
  if (role === "USER") return "User";
  return "Unresolved";
}

export default async function AdminIncidentsPage() {
  const { admin } = await m2RequireAdmin();
  if (!admin) redirect("/home");

  const incidents = await listCustomerIncidentLog(200);

  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Admin — Customer incidents</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/65">
        Privacy-minimized error evidence for support investigations. Use the incident reference a customer sees to find the route, release, and server-derived account role involved.
      </p>

      <div className="mt-4"><AdminNav /></div>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.02]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-[0.1em] text-white/50">
            <tr>
              <th className="px-4 py-3">Time / incident</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Role at incident</th>
              <th className="px-4 py-3">Route / digest</th>
              <th className="px-4 py-3">Environment / revision</th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 ? (
              <tr><td className="px-4 py-5 text-white/50" colSpan={5}>No customer error incidents recorded.</td></tr>
            ) : incidents.map((incident) => (
              <tr key={incident.id} className="border-b border-white/10 last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3">
                  <p className="font-bold text-white/90">{incident.incidentReference}</p>
                  <p className="mt-1 text-xs text-white/45">{incident.occurredAt.toISOString()}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold text-white/90">{incident.accountEmail ?? "Account not resolved"}</p>
                  <p className="mt-1 text-xs text-white/45">Ref: {incident.accountReference} · current {roleLabel(incident.accountCurrentRole)}</p>
                </td>
                <td className="px-4 py-3 font-bold text-[var(--social-blue)]">{roleLabel(incident.roleAtIncident)}</td>
                <td className="px-4 py-3 text-white/65">
                  <p className="max-w-64 truncate">{incident.route ?? "Unavailable"}</p>
                  <p className="mt-1 max-w-64 truncate text-xs text-white/45">{incident.errorDigest ?? "digest unavailable"}</p>
                </td>
                <td className="px-4 py-3 text-white/65">
                  <p>{incident.environment ?? "Unavailable"}</p>
                  <p className="mt-1 max-w-48 truncate text-xs text-white/45">{incident.revision ?? "revision unavailable"}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/45">
        Role-at-incident is captured from the canonical database account by the server. Raw errors, stack traces, Auth0 subjects, tokens, cookies, IP addresses, user-agent strings, and request bodies are not collected here.
      </p>
    </section>
  );
}
