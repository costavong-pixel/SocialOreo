import { afterEach, describe, expect, it, vi } from "vitest";

describe("Content Factory runtime selection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports an unconfigured staging path as unhealthy instead of returning a fake request", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CONTENT_FACTORY_ENABLED", "false");
    vi.resetModules();
    const { createContentFactoryClient } = await import("./client");
    const client = createContentFactoryClient();
    await expect(client.health()).resolves.toEqual({ status: "disabled", contract: "v1", data_reachable: false });
    await expect(client.createRequest({ workspaceExternalId: "wsp_1", destinationRef: "dst_1", language: "en", requestedCount: 1, idempotencyKey: "intent_1" })).rejects.toThrow("no Post was created");
  });
});
