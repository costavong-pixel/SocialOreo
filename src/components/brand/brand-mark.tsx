import Link from "next/link";

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link aria-label="SocialOlla home" className={`inline-flex items-center gap-2.5 font-display text-xl font-extrabold tracking-[-0.045em] ${inverse ? "text-white" : "text-[var(--social-ink)]"}`} href="/">
      <span aria-hidden="true" className={`grid size-8 place-items-center rounded-[0.7rem] ${inverse ? "bg-[var(--social-lime)] text-[var(--social-ink)]" : "bg-[var(--social-ink)] text-[var(--social-lime)]"}`}>
        <span className="relative block size-4 rounded-full border-[3px] border-current">
          <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-current" />
        </span>
      </span>
      <span>SocialOlla</span>
    </Link>
  );
}
