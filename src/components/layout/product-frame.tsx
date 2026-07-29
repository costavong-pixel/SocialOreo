import type { ReactNode } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";

type ProductFrameProps = {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  maxWidth?: "narrow" | "wide";
  utility?: ReactNode;
};

export function ProductFrame({
  children,
  backHref = "/dashboard",
  backLabel = "Workspace",
  maxWidth = "wide",
  utility,
}: ProductFrameProps) {
  return (
    <main className="so-task-page">
      <div className={`so-task-shell ${maxWidth === "narrow" ? "so-task-shell-narrow" : ""}`}>
        <header className="so-topbar">
          <BrandMark inverse />
          <nav aria-label="Product" className="so-topbar-nav">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/audits/new">New audit</Link>
            {utility}
          </nav>
        </header>
        <Link className="so-back-link" href={backHref}>
          <span aria-hidden="true">←</span>
          {backLabel}
        </Link>
        <div className="so-page-content">{children}</div>
      </div>
    </main>
  );
}
