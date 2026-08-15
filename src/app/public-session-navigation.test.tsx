import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionUser } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getSessionUser: () => mockGetSessionUser(),
}));

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...props }, children),
  };
});

vi.mock("@/components/assistant/assistant-panel", async () => {
  const React = await import("react");
  return {
    AssistantPanel: ({ authenticated }: { authenticated: boolean }) => React.createElement("output", { "data-testid": "assistant-auth" }, String(authenticated)),
  };
});

vi.mock("@/components/credits/checkout-buttons", async () => {
  const React = await import("react");
  return { CheckoutButtons: () => React.createElement("output", { "data-testid": "checkout-buttons" }, "checkout") };
});

import HomePage from "./page";
import PricingPage from "./pricing/page";

describe("public session-aware navigation", () => {
  afterEach(() => vi.clearAllMocks());

  it("keeps Sign in for a guest on the homepage", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    render(await HomePage());

    expect((screen.getByRole("link", { name: "Sign in" }) as HTMLAnchorElement).getAttribute("href")).toBe("/sign-in");
    expect(screen.getByTestId("assistant-auth").textContent).toBe("false");
  });

  it("shows Dashboard and Sign out after an Auth0 session reaches the homepage", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "auth0-user", email: "creator@example.com", emailVerified: true });

    render(await HomePage());

    expect((screen.getByRole("link", { name: "Dashboard" }) as HTMLAnchorElement).getAttribute("href")).toBe("/dashboard");
    expect((screen.getByRole("link", { name: "Sign out" }) as HTMLAnchorElement).getAttribute("href")).toBe("/auth/logout");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByTestId("assistant-auth").textContent).toBe("true");
  });

  it("does not present unverified sessions as assistant-authorized", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "auth0-user", email: "creator@example.com", emailVerified: false });

    render(await HomePage());

    expect(screen.getByTestId("assistant-auth").textContent).toBe("false");
  });

  it("does not invite an already signed-in visitor to authenticate again from pricing", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "auth0-user", email: "creator@example.com", emailVerified: true });

    render(await PricingPage());

    expect((screen.getByRole("link", { name: "Dashboard" }) as HTMLAnchorElement).getAttribute("href")).toBe("/dashboard");
    expect((screen.getByRole("link", { name: "Sign out" }) as HTMLAnchorElement).getAttribute("href")).toBe("/auth/logout");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
