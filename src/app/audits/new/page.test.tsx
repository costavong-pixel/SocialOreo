import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionUser, mockRequireAdminByAuthUserId, mockEvaluateServerMonthlyAvailability } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockRequireAdminByAuthUserId: vi.fn(),
  mockEvaluateServerMonthlyAvailability: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ getSessionUser: () => mockGetSessionUser() }));
vi.mock("@/lib/auth/roles", () => ({ requireAdminByAuthUserId: (...args: unknown[]) => mockRequireAdminByAuthUserId(...args) }));
vi.mock("@/lib/payments/square/monthly-availability", () => ({ evaluateServerMonthlyAvailability: (...args: unknown[]) => mockEvaluateServerMonthlyAvailability(...args) }));
vi.mock("@/components/layout/product-frame", async () => {
  const React = await import("react");
  return { ProductFrame: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) };
});
vi.mock("@/components/audit/new-audit-form", async () => {
  const React = await import("react");
  return {
    NewAuditForm: ({ isAdmin, monthlyAvailable }: { isAdmin: boolean; monthlyAvailable: boolean }) =>
      React.createElement("output", { "data-testid": "audit-form-props" }, `${isAdmin}:${monthlyAvailable}`),
  };
});

import NewAuditPage from "./page";

describe("NewAuditPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes the server-computed Monthly availability to NewAuditForm", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "auth-owner", email: "owner@example.com", emailVerified: true });
    mockRequireAdminByAuthUserId.mockResolvedValue(true);
    mockEvaluateServerMonthlyAvailability.mockResolvedValue({ available: true, reason: "READY" });

    render(await NewAuditPage());

    expect(screen.getByTestId("audit-form-props").textContent).toBe("true:true");
  });

  it("does not calculate Monthly availability for an unauthenticated page", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    render(await NewAuditPage());

    expect(mockEvaluateServerMonthlyAvailability).toHaveBeenCalledWith(null, false);
    expect(screen.queryByTestId("audit-form-props")).toBeNull();
  });
});
