import { shellStateLabel } from "@/lib/socialolla/shell/shell";

export default function M2AppLoading() {
  return (
    <div role="status" className="grid min-h-[40dvh] place-items-center">
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-5 text-center">
        <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[var(--social-blue)] border-t-transparent" aria-hidden="true" />
        <p className="mt-3 text-sm font-bold text-white/70">{shellStateLabel("loading")}</p>
      </div>
    </div>
  );
}
