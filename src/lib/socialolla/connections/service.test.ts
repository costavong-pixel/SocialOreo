import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { connectionAvailable, saveConnection } from "./service";

describe("connection service fail-closed boundaries", () => {
  it("does not expose a connection route unless the exact separate gate and provider opt-in are present", () => {
    const base = { NODE_ENV: "production", SOCIALOLLA_ENV: "production", SOCIALOLLA_PROVIDER_DISABLED: "false" };
    expect(connectionAvailable("facebook", base)).toBe(false);
    expect(connectionAvailable("facebook", { ...base, SOCIALOLLA_FACEBOOK_CONNECTION_ENABLED: "TRUE" })).toBe(false);
    expect(connectionAvailable("facebook", { ...base, SOCIALOLLA_FACEBOOK_CONNECTION_ENABLED: "true" })).toBe(true);
  });

  it("fails closed when the connection gate is disabled", async () => {
    vi.stubEnv("SOCIALOLLA_CONNECTION_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("SOCIALOLLA_FACEBOOK_CONNECTION_ENABLED", "false");
    await expect(saveConnection({
      userId: "user_not_reached",
      platform: "facebook",
      token: { accessToken: "not-persisted", scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"] },
      destinations: [{ platformUserId: "page_1", label: "Page", destinationType: "PAGE", eligible: true }],
    })).rejects.toThrow(/Connection is disabled/);
    vi.unstubAllEnvs();
  });

  it("refuses token persistence when the provider did not grant every required scope", async () => {
    vi.stubEnv("SOCIALOLLA_CONNECTION_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SOCIALOLLA_ENV", "production");
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "false");
    vi.stubEnv("SOCIALOLLA_FACEBOOK_CONNECTION_ENABLED", "true");
    await expect(saveConnection({
      userId: "user_not_reached",
      platform: "facebook",
      token: { accessToken: "not-persisted", scopes: ["pages_show_list"] },
      destinations: [{ platformUserId: "page_1", label: "Page", destinationType: "PAGE", eligible: true }],
    })).rejects.toThrow(/required connection scopes/);
    vi.unstubAllEnvs();
  });
});
