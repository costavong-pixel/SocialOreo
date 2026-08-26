import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserRole } from "@prisma/client";

import { ProfileContextView } from "./profile-context-view";

vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      React.createElement("a", { href, ...props }, children),
  };
});

const baseContext = {
  displayName: "Costa Vong",
  email: "costavong@gmail.com",
  emailVerified: true,
  authProvider: "Auth0" as const,
  acceptanceBootstrapState: "active" as const,
  role: UserRole.ADMIN,
  supportReference: "ABC1234DEF",
  workspaceLabel: "Personal workspace",
  plan: "No active plan",
  creditBalance: 0,
  connections: [
    { platform: "Instagram" as const, status: "Not connected" as const },
    { platform: "TikTok" as const, status: "Not available in staging" as const },
  ],
  locale: "en-US",
  timezone: null,
  environment: "Staging" as const,
  providerMode: "Disabled" as const,
};

describe("profile account context", () => {
  it("shows the safe active-account context without raw identifiers", () => {
    const { container } = render(<ProfileContextView context={baseContext} />);

    expect(screen.getByTestId("profile-email").textContent).toBe("costavong@gmail.com");
    expect(screen.getByTestId("profile-role").textContent).toBe("Admin");
    expect(screen.getByTestId("profile-email-verified").textContent).toBe("Yes");
    expect(screen.getByTestId("profile-auth-provider").textContent).toBe("Auth0");
    expect(screen.getByTestId("profile-staging-override").textContent).toBe("Active");
    expect(screen.getByTestId("profile-workspace-label").textContent).toBe("Personal workspace");
    expect(screen.getByTestId("profile-environment").textContent).toBe("Staging");
    expect(screen.getByTestId("profile-provider-mode").textContent).toBe("Disabled");
    expect(container.textContent).not.toContain("auth0");
    expect(container.textContent).not.toContain("wsp_");
    expect(container.textContent).not.toContain("workspace ID");
  });

  it("renders an unverified state instead of silently treating it as verified", () => {
    render(<ProfileContextView context={{ ...baseContext, emailVerified: false, role: UserRole.USER, environment: "Development" }} />);

    expect(screen.getByTestId("profile-email-verified").textContent).toBe("No");
    expect(screen.getByTestId("profile-role").textContent).toBe("User");
    expect(screen.queryByTestId("profile-environment")).toBeNull();
  });
});
