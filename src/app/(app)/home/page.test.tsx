import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveDbUserFromVerifiedSession: vi.fn(),
  hasDbSessionIdentityConflict: vi.fn(),
  getOrCreatePersonalWorkspace: vi.fn(),
  loadDashboardSummary: vi.fn(),
}));

vi.mock("@/lib/auth/sync-user", () => ({
  resolveDbUserFromVerifiedSession: mocks.resolveDbUserFromVerifiedSession,
  hasDbSessionIdentityConflict: mocks.hasDbSessionIdentityConflict,
}));
vi.mock("@/lib/socialolla/workspace", () => ({ getOrCreatePersonalWorkspace: mocks.getOrCreatePersonalWorkspace }));
vi.mock("@/lib/socialolla/dashboard/dashboard-summary", () => ({ loadDashboardSummary: mocks.loadDashboardSummary }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...props }, children),
  };
});

import HomePage from "./page";

describe("canonical dashboard customer-visible acceptance", () => {
  it("renders one value summary with honest feature states", async () => {
    mocks.resolveDbUserFromVerifiedSession.mockResolvedValue({ dbId: "user_1", authUserId: "auth_1", email: "user@example.com" });
    mocks.hasDbSessionIdentityConflict.mockReturnValue(false);
    mocks.getOrCreatePersonalWorkspace.mockResolvedValue({ dbId: "workspace_1", id: "wsp_1", label: "Personal workspace" });
    mocks.loadDashboardSummary.mockResolvedValue({
      overallState: "PARTIAL",
      providerDisabled: true,
      recommendedAction: { title: "Connect a sandbox destination", description: "Add a destination", href: "/connections" },
      analysis: { state: "PARTIAL", count: 0, latest: null },
      posts: { state: "PARTIAL", total: 0, draft: 0, scheduled: 0, failed: 0, latest: [] },
      watch: { state: "DISABLED", activeMonitors: 0, totalMonitors: 0, reports: 0, latestReport: null, nextCaptureAt: null },
      connections: { state: "UI_ONLY", total: 0, connected: 0, reconnectRequired: 0, destinations: [], instagramInsights: null },
      credits: { state: "PARTIAL", canonicalAvailable: 0, canonicalBatchCount: 0, legacyBalance: 0, plan: "NONE", planVersion: null, recentActivity: [] },
      upcoming: [],
    });

    render(await HomePage());

    expect(screen.getByRole("heading", { name: "Dashboard" })).not.toBeNull();
    for (const label of ["Profile Analysis", "Posts", "Watch", "Connections", "Credits & plan", "Calendar"]) {
      expect(screen.getByRole("heading", { name: label })).not.toBeNull();
    }
    expect(screen.getByTestId("socialolla-dashboard")).not.toBeNull();
    expect(screen.getByTestId("dashboard-state").textContent).toContain("PARTIAL");
    expect(screen.getByTestId("dashboard-watch-summary").textContent).toContain("DISABLED");
    expect(screen.getByRole("link", { name: "Open Analysis" }).getAttribute("href")).toBe("/analysis");
    expect(screen.getByRole("link", { name: "Open Posts" }).getAttribute("href")).toBe("/posts");
    expect(screen.queryByText(/SocialOreo|SOCIALOREO|Run your first audit to unlock the dashboard/i)).toBeNull();
  });
});
