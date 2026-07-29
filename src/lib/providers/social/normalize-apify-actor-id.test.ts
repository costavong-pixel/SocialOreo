import { describe, expect, it } from "vitest";

import { normalizeApifyActorId } from "./normalize-apify-actor-id";

describe("normalizeApifyActorId", () => {
  it("converts slash actor ids to tilde format", () => {
    expect(normalizeApifyActorId("apify/instagram-scraper")).toBe("apify~instagram-scraper");
  });

  it("leaves tilde actor ids unchanged", () => {
    expect(normalizeApifyActorId("apify~instagram-scraper")).toBe("apify~instagram-scraper");
  });
});
