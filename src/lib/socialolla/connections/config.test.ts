import { describe, expect, it } from "vitest";
import { connectionClientConfig, connectionEnabled, connectionRedirectUri } from "./config";

describe("connection configuration", () => {
  it("uses provider-family credentials without exposing values", () => {
    const config = connectionClientConfig("facebook", { SOCIALOLLA_META_CLIENT_ID: "meta-id", SOCIALOLLA_META_CLIENT_SECRET: "meta-secret" });
    expect(config).toMatchObject({ clientIdKey: "SOCIALOLLA_META_CLIENT_ID", clientSecretKey: "SOCIALOLLA_META_CLIENT_SECRET" });
    expect(config).not.toHaveProperty("accessToken");
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
