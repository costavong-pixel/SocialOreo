import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});
vi.mock("@/components/nav/language-select", async () => {
  const React = await import("react");
  return {
    LanguageSelect: () => React.createElement("output", { "data-testid": "language-select" }, "language"),
  };
});

import { AppShellNav } from "./app-shell-nav";

const account = {
  displayName: "New user",
  email: "new@example.com",
  role: "USER" as const,
  emailVerified: true,
};

describe("authenticated account menu", () => {
  it("shows exactly who is signed in, USER role, and explicit verification state", () => {
    render(<AppShellNav locale="en-US" isAdmin={false} account={account} />);

    expect(screen.getByTestId("account-email").textContent).toBe("new@example.com");
    expect(screen.getByTestId("account-role").textContent).toContain("Role: User");
    expect(screen.getByTestId("account-email-verified").textContent).toContain("Email verified: Yes");

    const profileLinks = screen.getAllByRole("link", { name: "Profile" });
    expect(profileLinks).toHaveLength(1);
    expect(profileLinks[0]?.getAttribute("href")).toBe("/profile");

    expect(screen.getAllByRole("link", { name: "Settings" }).some((link) => link.getAttribute("href") === "/settings")).toBe(true);
    expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
  });

  it("shows the ADMIN role and Admin entry only for a server-authorized admin", () => {
    render(<AppShellNav locale="en-US" isAdmin account={{ ...account, role: "ADMIN" }} />);

    expect(screen.getAllByRole("link", { name: /^Admin$/ }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("account-role").textContent).toContain("Role: Admin");
    expect(screen.getByTestId("account-email-verified").textContent).toContain("Email verified: Yes");
  });

  it("shows an explicit No when Auth0 reports email_verified=false", () => {
    render(<AppShellNav locale="en-US" isAdmin={false} account={{ ...account, emailVerified: false }} />);

    expect(screen.getByTestId("account-email").textContent).toBe("new@example.com");
    expect(screen.getByTestId("account-role").textContent).toContain("Role: User");
    expect(screen.getByTestId("account-email-verified").textContent).toContain("Email verified: No");
  });
});
