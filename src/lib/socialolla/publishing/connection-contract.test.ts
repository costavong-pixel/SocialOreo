import { describe, expect, it, vi } from "vitest";

import { createPublishingConnectionAdapters } from "./connection-contract";
import { PUBLISHING_PLATFORMS } from "./platform-adaptation";

vi.mock("@/lib/db/prisma", () => ({ prisma: { destination: { findMany: vi.fn().mockResolvedValue([]) } } }));

describe("shared publishing connection contract", () => {
  it("exposes one adapter contract for all ten platforms", () => {
    const adapters = createPublishingConnectionAdapters();
    expect(Object.keys(adapters).sort()).toEqual([...PUBLISHING_PLATFORMS].sort());
    for (const platform of PUBLISHING_PLATFORMS) {
      const adapter = adapters[platform];
      expect(adapter.platform).toBe(platform);
      expect(adapter.connect).toBeTypeOf("function");
      expect(adapter.callback).toBeTypeOf("function");
      expect(adapter.refresh).toBeTypeOf("function");
      expect(adapter.disconnect).toBeTypeOf("function");
      expect(adapter.verifyEligibility).toBeTypeOf("function");
      expect(adapter.listDestinations).toBeTypeOf("function");
    }
  });

  it("does not claim unavailable providers are connected", async () => {
    const adapters = createPublishingConnectionAdapters();
    const result = await adapters.linkedin.connect({});
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.reason).toContain("approval");
    expect((await adapters.linkedin.listDestinations({ workspaceId: "ws_1" })).length).toBe(0);
  });

  it("keeps Instagram on the existing server-side route", async () => {
    const adapters = createPublishingConnectionAdapters();
    await expect(adapters.instagram.connect({})).resolves.toMatchObject({
      status: "AVAILABLE",
      authorizationPath: "/api/meta/instagram/publish/connect",
    });
    const callback = await adapters.instagram.callback({ code: "redacted", state: "redacted" });
    expect(callback.authorizationPath).toBe("/api/meta/instagram/publish/callback");
  });
});
