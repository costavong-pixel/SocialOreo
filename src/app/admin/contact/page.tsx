import Link from "next/link";
import { redirect } from "next/navigation";

import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export async function ContactInboxPageContent() {
  const sessionUser = await getVerifiedSessionUser();
  const resolution = await resolveDbUserFromVerifiedSession();
  if (hasDbSessionIdentityConflict(resolution)) redirect("/account-conflict");
  if (!sessionUser || !resolution) redirect("/auth/login");

  if (!(await requireAdminByAuthUserId(resolution.authUserId))) redirect("/home");

  const requests = await prisma.contactRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  return <section className="so-admin"><div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.2em] text-black/50">Support</p><h1 className="mt-2 text-4xl font-black tracking-[-0.04em]">Contact inbox</h1><p className="mt-3 text-black/65">The latest 100 messages from the public contact form.</p></div><Link className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-black" href="/admin/feedback">Analysis feedback</Link></div><div className="mt-8 grid gap-4">{requests.length ? requests.map((request) => <article className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm" key={request.id}><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-black">{request.name}</h2><p className="text-sm text-black/60">{request.email}</p></div><time className="text-sm font-semibold text-black/55">{formatDate(request.createdAt)}</time></div><p className="mt-4 whitespace-pre-wrap rounded-xl border border-black/10 bg-black/[0.025] p-4 text-sm leading-6 text-black/75">{request.message}</p></article>) : <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 p-8 text-center text-black/60">No support messages yet.</div>}</div></section>;
}

export default function ContactInboxPage() {
  return <ContactInboxPageContent />;
}
