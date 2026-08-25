import { describe, expect, it } from "vitest";

import { accountSupportReference } from "./support-reference";

describe("account support reference", () => {
  it("is stable, short, and non-secret", () => {
    const reference = accountSupportReference("db-user-123");

    expect(reference).toMatch(/^[A-F0-9]{10}$/);
    expect(accountSupportReference("db-user-123")).toBe(reference);
    expect(reference).not.toContain("db-user-123");
    expect(accountSupportReference("db-user-456")).not.toBe(reference);
  });
});
