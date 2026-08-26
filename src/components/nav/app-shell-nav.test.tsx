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
  it("shows identity and hides Admin for a USER account", () => {
    render(<AppShellNav locale="en-US" isAdmin={false} account={account} />);

    expect(screen.getByText("new@example.com")).toBeTruthy();
    expect(screen.getByText("Role: User")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe("/profile");
    expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
  });

  it("shows the Admin entry only when the server-authorized role is ADMIN", () => {
    render(<AppShellNav locale="en-US" isAdmin account={{ ...account, role: "ADMIN" }} />);

    expect(screen.getAllByRole("link", { name: /^Admin$/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("Role: Admin")).toBeTruthy();
  });
});
