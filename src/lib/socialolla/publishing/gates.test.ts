import { describe, expect, it } from "vitest";
import { platformPublishingGate, postPublishingEnabled } from "./gates";

describe("per-platform Post gates", () => {
  it("defaults every platform to disabled", () => {
    for (const platform of ["instagram", "facebook", "threads", "google_business", "linkedin", "tiktok", "youtube", "pinterest", "x", "reddit"]) {
      const flag = "SOCIALOLLA_" + platform.toUpperCase() + "_PUBLISH_ENABLED";
      expect(postPublishingEnabled(platform, {
        NODE_ENV: "production",
        SOCIALOLLA_ENV: "production",
        SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true",
        SOCIALOLLA_PROVIDER_DISABLED: "false",
        [flag]: "false",
      })).toBe(false);
    }
  });

  it("requires the exact production worker, platform flag, and provider opt-out", () => {
    const base = {
      NODE_ENV: "production",
      SOCIALOLLA_ENV: "production",
      SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "true",
      SOCIALOLLA_FACEBOOK_PUBLISH_ENABLED: "true",
    };
    expect(postPublishingEnabled("facebook", base)).toBe(false);
    expect(postPublishingEnabled("facebook", { ...base, SOCIALOLLA_PROVIDER_DISABLED: "true" })).toBe(false);
    expect(postPublishingEnabled("facebook", { ...base, SOCIALOLLA_PROVIDER_DISABLED: "false" })).toBe(true);
    expect(postPublishingEnabled("facebook", { ...base, SOCIALOLLA_PROVIDER_DISABLED: "false", SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED: "TRUE" })).toBe(false);
  });

  it("preserves normalized staging compatibility for existing Instagram flows", () => {
    expect(postPublishingEnabled("instagram", {
      NODE_ENV: " StAgInG ",
      SOCIALOLLA_ENV: " staging ",
      SOCIALOLLA_INSTAGRAM_PUBLISH_ENABLED: "true",
      SOCIALOLLA_PROVIDER_DISABLED: "false",
    })).toBe(true);
  });

  it("reports the gate env key without enabling it", () => {
    expect(platformPublishingGate("google_business", {}).envKey).toBe("SOCIALOLLA_GOOGLE_BUSINESS_PUBLISH_ENABLED");
    expect(platformPublishingGate("google_business", {}).enabled).toBe(false);
  });
});
