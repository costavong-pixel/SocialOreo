import { UserRole } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { isAdminRole } from "./roles";

describe("isAdminRole", () => {
  it("returns true for admin users", () => {
    expect(isAdminRole(UserRole.ADMIN)).toBe(true);
  });

  it("returns false for standard users", () => {
    expect(isAdminRole(UserRole.USER)).toBe(false);
  });
});
