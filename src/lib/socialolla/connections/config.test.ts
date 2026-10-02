import { describe, expect, it } from "vitest";
import { connectionClientConfig, connectionClientEnvKeys, connectionEnabled, connectionRedirectUri } from "./config";

describe("connection configuration", () => {
  it("uses provider-family credentials without exposing values", () => {
    const config = connectionClientConfig("facebook", { SOCIALOLLA_META_CLIENT_ID: "meta-id", SOCIALOLLA_META_CLIENT_SECRET: "meta-secret" });
    expect(config).toMatchObject({ clientIdKey: "SOCIALOLLA_META_CLIENT_ID", clientSecretKey: "SOCIALOLLA_META_CLIENT_SECRET" });
    expect(config).not.toHaveProperty("accessToken");
  });

  it("uses dedicated Threads credentials without falling back to another Meta app", () => {
    const threads = connectionClientConfig("threads", { SOCIALOLLA_THREADS_CLIENT_ID: "threads-id", SOCIALOLLA_THREADS_CLIENT_SECRET: "threads-secret" });
    expect(threads).toMatchObject({ clientIdKey: "SOCIALOLLA_THREADS_CLIENT_ID", clientSecretKey: "SOCIALOLLA_THREADS_CLIENT_SECRET" });
    expect(connectionClientConfig("threads", { SOCIALOLLA_META_CLIENT_ID: "meta-id", SOCIALOLLA_META_CLIENT_SECRET: "meta-secret" })).toBeNull();
    expect(connectionClientConfig("threads", { META_INSTAGRAM_CLIENT_ID: "instagram-id", META_INSTAGRAM_CLIENT_SECRET: "instagram-secret" })).toBeNull();
    expect(connectionClientConfig("facebook", { META_INSTAGRAM_CLIENT_ID: "instagram-id", META_INSTAGRAM_CLIENT_SECRET: "instagram-secret" })).toBeNull();
    expect(connectionClientEnvKeys("threads")).toEqual(["SOCIALOLLA_THREADS_CLIENT_ID", "SOCIALOLLA_THREADS_CLIENT_SECRET"]);
    expect(connectionClientEnvKeys("facebook")).toEqual(["SOCIALOLLA_META_CLIENT_ID", "SOCIALOLLA_META_CLIENT_SECRET"]);
  });

  it("requires exact environment and connection gates", () => {
    const base = { NODE_ENV: "production", SOCIALOLLA_ENV: "production", SOCIALOLLA_FACEBOOK_CONNECTION_ENABLED: "true", SOCIALOLLA_PROVIDER_DISABLED: "false" };
    expect(connectionEnabled("facebook", base)).toBe(true);
    expect(connectionEnabled("facebook", { ...base, SOCIALOLLA_FACEBOOK_CONNECTION_ENABLED: "TRUE" })).toBe(false);
    expect(connectionEnabled("facebook", { ...base, SOCIALOLLA_PROVIDER_DISABLED: "true" })).toBe(false);
  });

  it("uses the shared callback route", () => {
    expect(connectionRedirectUri("google_business", { APP_URL: "https://socialolla.com/" })).toBe("https://socialolla.com/api/connections/google_business/callback");
  });
});
