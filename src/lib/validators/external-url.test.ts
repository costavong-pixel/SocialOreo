import { describe, expect, it } from "vitest";
import { safeHttpsUrl } from "./external-url";

describe("safeHttpsUrl", () => {
  it("accepts ordinary HTTPS provider URLs", () => {
    expect(safeHttpsUrl("https://cdn.example.test/image.jpg")).toBe("https://cdn.example.test/image.jpg");
  });

  it("rejects non-HTTPS schemes and credential-bearing URLs", () => {
    expect(safeHttpsUrl("http://cdn.example.test/image.jpg")).toBeUndefined();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpsUrl("https://user:pass@cdn.example.test/image.jpg")).toBeUndefined();
  });
});
