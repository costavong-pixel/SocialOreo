import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SHELL_NAV } from "@/lib/socialolla/shell/shell";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("Phase 1 canonical SocialOlla shell contract", () => {
  it("exposes one complete customer navigation", () => {
    expect(SHELL_NAV.map((item) => item.href)).toEqual([
      "/home",
      "/posts",
      "/watch",
      "/calendar",
      "/connections",
      "/credits",
      "/analysis",
      "/assistant",
      "/settings",
      "/profile",
    ]);
  });

  it("keeps public authenticated links on the canonical dashboard", () => {
    expect(source("src/app/page.tsx")).not.toMatch(/href="\/dashboard"/);
    expect(source("src/app/pricing/page.tsx")).not.toMatch(/href="\/dashboard"/);
    expect(source("src/app/dashboard/page.tsx")).toContain('permanentRedirect("/home")');
    expect(source("src/app/post/page.tsx")).toContain('permanentRedirect("/posts")');
    expect(source("src/app/(app)/home/page.tsx")).toContain('title: "Dashboard — SocialOlla"');
    expect(source("src/app/(app)/home/page.tsx")).toContain(">Dashboard</h1>");
  });

  it("sends successful sign-in into the authenticated shell", () => {
    expect(source("src/lib/auth/auth0.ts")).toContain('signInReturnToPath: "/home"');
    expect(source("src/app/sign-in/[[...sign-in]]/page.tsx")).toContain("/auth/login?returnTo=%2Fhome");
    expect(source("src/app/(app)/layout.tsx")).toContain("/auth/login?returnTo=%2Fhome");
  });

  it("keeps customer routes free of the owner-reported internal controls", () => {
    const customerSources = [
      "src/app/(app)/posts/page.tsx",
      "src/app/(app)/connections/page.tsx",
      "src/app/(app)/calendar/page.tsx",
      "src/app/(app)/settings/page.tsx",
      "src/components/connections/add-destination-form.tsx",
    ].map(source).join("\n");

    expect(customerSources).not.toContain("Destination external id");
    expect(customerSources).not.toContain("Add sandbox destination");
    expect(customerSources).not.toContain("provider-disabled Post occurrences");
  });

  it("keeps account context on a canonical, customer-safe profile route", () => {
    expect(source("src/app/profile/page.tsx")).toContain('title: "Profile — SocialOlla"');
    expect(SHELL_NAV.some((item) => item.href === "/profile")).toBe(true);
    expect(source("src/components/profile/profile-context-view.tsx")).not.toMatch(/authUserId|accessToken|refreshToken|workspace ID/);
  });

  it("requires the SocialOlla brand and rejects legacy customer copy in canonical runtime modules", () => {
    expect(source("src/components/brand/brand-mark.tsx")).toContain("SocialOlla");
    expect(source("src/components/brand/brand-mark.tsx")).not.toContain("SocialOreo");
    expect(source("src/components/nav/app-shell-nav.tsx")).toContain("SocialOlla");
    for (const file of [
      "src/app/(app)/analysis/page.tsx",
      "src/app/(app)/analysis/new/page.tsx",
      "src/app/(app)/analysis/[id]/page.tsx",
      "src/app/audits/new/page.tsx",
      "src/app/audits/[id]/page.tsx",
    ]) {
      expect(source(file), file).not.toMatch(/SocialOreo|SOCIALOREO|Run your first audit to unlock the dashboard/);
    }
  });

  it("keeps Analysis report ownership bound to the resolved DB user", () => {
    const page = source("src/app/audits/[id]/page.tsx");
    const api = source("src/app/api/audits/[id]/route.ts");
    const feedback = source("src/app/api/audits/[id]/feedback/route.ts");
    expect(page).toContain("where: { id, userId: resolution.dbId }");
    expect(api).toContain("where: { id, userId: resolution.dbId }");
    expect(feedback).toContain("userId: dbUserId");
  });

  it("keeps admin visibility behind the ADMIN-only branch", () => {
    const nav = source("src/components/nav/app-shell-nav.tsx");
    expect(nav).toMatch(/isAdmin/);
    expect(nav).toContain('href="/admin/plans"');
    expect(source("src/app/admin/layout.tsx")).toContain("M2AppLayout");
    expect(source("src/app/admin/layout.tsx")).toContain("AdminNav");
    expect(source("src/app/(app)/admin/plans/page.tsx")).toContain("AdminNav");
    expect(source("src/components/admin/admin-nav.tsx")).toContain('href="/admin/feedback"');
  });

  it("preserves legacy Analysis deep links as canonical redirects", () => {
    expect(source("src/app/audits/new/page.tsx")).toContain('permanentRedirect("/analysis/new")');
    expect(source("src/app/audits/[id]/page.tsx")).toContain("permanentRedirect(`/analysis/${id}`)");
    expect(source("src/app/audits/[id]/compare/page.tsx")).toContain("/analysis/${id}/compare");
  });
});
