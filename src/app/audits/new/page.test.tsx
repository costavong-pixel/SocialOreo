import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetVerifiedSessionUser, mockResolveDbUserFromVerifiedSession, mockRequireAdminByAuthUserId, mockEvaluateServerMonthlyAvailability, mockWorkspace, mockRedirect } = vi.hoisted(() => ({
  mockGetVerifiedSessionUser: vi.fn(),
  mockResolveDbUserFromVerifiedSession: vi.fn(),
  mockRequireAdminByAuthUserId: vi.fn(),
  mockEvaluateServerMonthlyAvailability: vi.fn(),
  mockWorkspace: vi.fn(),
  mockRedirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
  permanentRedirect: (path: string) => mockRedirect(path),
}));
vi.mock("@/lib/auth/current-user", () => ({ getVerifiedSessionUser: () => mockGetVerifiedSessionUser() }));
vi.mock("@/lib/auth/sync-user", () => ({
  resolveDbUserFromVerifiedSession: () => mockResolveDbUserFromVerifiedSession(),
  hasDbSessionIdentityConflict: (resolution: unknown) => Boolean(resolution && typeof resolution === "object" && "status" in resolution && (resolution as { status?: string }).status === "identity-conflict"),
}));
vi.mock("@/lib/auth/roles", () => ({ requireAdminByAuthUserId: (...args: unknown[]) => mockRequireAdminByAuthUserId(...args) }));
vi.mock("@/lib/payments/square/monthly-availability", () => ({ evaluateServerMonthlyAvailability: (...args: unknown[]) => mockEvaluateServerMonthlyAvailability(...args) }));
vi.mock("@/lib/socialolla/workspace", () => ({ getOrCreatePersonalWorkspace: (...args: unknown[]) => mockWorkspace(...args) }));
vi.mock("@/components/audit/new-audit-form", async () => {
  const React = await import("react");
  return {
    NewAuditForm: ({ isAdmin, monthlyAvailable }: { isAdmin: boolean; monthlyAvailable: boolean }) =>
      React.createElement("output", { "data-testid": "audit-form-props" }, `${isAdmin}:${monthlyAvailable}`),
  };
});

import { AnalysisNewPage } from "./page";

describe("NewAuditPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes the server-computed Monthly availability to NewAuditForm", async () => {
    mockGetVerifiedSessionUser.mockResolvedValue({ id: "auth-owner", email: "owner@example.com", emailVerified: true });
    mockResolveDbUserFromVerifiedSession.mockResolvedValue({ dbId: "db-owner", authUserId: "auth-owner", email: "owner@example.com" });
    mockRequireAdminByAuthUserId.mockResolvedValue(true);
    mockEvaluateServerMonthlyAvailability.mockResolvedValue({ available: true, reason: "READY" });

    render(await AnalysisNewPage());

    expect(screen.getByTestId("audit-form-props").textContent).toBe("true:true");
  });

  it("does not calculate Monthly availability for an unauthenticated page", async () => {
    mockGetVerifiedSessionUser.mockResolvedValue(null);
    mockResolveDbUserFromVerifiedSession.mockResolvedValue(null);

    await expect(AnalysisNewPage()).rejects.toThrow("REDIRECT:/auth/login");
    expect(mockEvaluateServerMonthlyAvailability).not.toHaveBeenCalled();
  });
});
