import Link from "next/link";

/** One canonical navigation for every SocialOlla admin surface. */
export function AdminNav() {
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-2 text-sm font-bold">
      <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/plans">
        Plans
      </Link>
      <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/sessions">
        Session log
      </Link>
      <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/angle-library">
        Angle Library
      </Link>
      <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/contact">
        Contact
      </Link>
      <Link className="rounded-full border border-white/15 px-3 py-2 hover:border-[var(--social-blue)]" href="/admin/feedback">
        Analysis feedback
      </Link>
    </nav>
  );
}
