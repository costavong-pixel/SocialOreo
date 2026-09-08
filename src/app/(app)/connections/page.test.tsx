import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  m2Workspace: vi.fn(),
  m2DisconnectInstagramDestination: vi.fn(),
  findMany: vi.fn(),
  providerDisabledEnabled: vi.fn(),
}));

vi.mock("@/app/m2-actions", () => ({
  m2Workspace: mocks.m2Workspace,
  m2DisconnectInstagramDestination: mocks.m2DisconnectInstagramDestination,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { destination: { findMany: mocks.findMany } } }));
vi.mock("@/lib/providers/social/provider-guard", () => ({ providerDisabledEnabled: mocks.providerDisabledEnabled }));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => React.createElement("a", { href, ...props }, children),
  };
});

import ConnectionsPage from "./page";

describe("customer connections state", () => {
  it("shows a live Instagram connection and a workspace-scoped disconnect control", async () => {
    mocks.m2Workspace.mockResolvedValue({ dbId: "workspace_1", id: "wsp_1" });
    mocks.providerDisabledEnabled.mockReturnValue(false);
    mocks.findMany.mockResolvedValue([{
      id: "destination_1",
      externalId: "dst_live_1",
      label: "@approved-test-account",
      platform: "instagram",
      accountLabel: "@approved-test-account",
      status: "CONNECTED",
      providerDisabled: false,
      accessTokenCiphertext: "encrypted-only",
      publishingEligibilityVerifiedAt: new Date("2026-09-04T00:00:00.000Z"),
    }]);

    render(await ConnectionsPage());

    expect(screen.getByText("Connected")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect @approved-test-account" })).not.toBeNull();
    expect(screen.getByText("Live provider connection state is recorded for this workspace.")).not.toBeNull();
    expect(screen.queryByText("Provider-disabled staging test data — no live account or delivery is claimed.")).toBeNull();
  });

  it("labels provider-disabled staging data without offering live disconnect semantics", async () => {
    mocks.m2Workspace.mockResolvedValue({ dbId: "workspace_1", id: "wsp_1" });
    mocks.providerDisabledEnabled.mockReturnValue(true);
    mocks.findMany.mockResolvedValue([{
      id: "destination_fixture",
      externalId: "dst_staging_provider_disabled_test",
      label: "STAGING TEST Instagram (provider-disabled)",
      platform: "instagram",
      accountLabel: "@socialolla-staging-provider-disabled",
      status: "CONNECTED",
      providerDisabled: true,
      accessTokenCiphertext: null,
      publishingEligibilityVerifiedAt: null,
    }]);

    render(await ConnectionsPage());

    expect(screen.getByText("Provider-disabled staging test data — no live account or delivery is claimed.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Disconnect/i })).toBeNull();
  });
});
