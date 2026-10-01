import { describe, expect, it } from "vitest";
import { toConnectionDestination } from "./contracts";

describe("shared publishing connection contract", () => {
  it("normalizes destination states and never includes token fields", () => {
    const destination = toConnectionDestination({
      externalId: "dst_1",
      platform: "linkedin",
      destinationType: "ACCOUNT",
      label: "LinkedIn member",
      accountLabel: "Member",
      status: "CONNECTED",
      scopes: ["w_member_social"],
      providerDisabled: true,
    });
    expect(destination).toMatchObject({ platform: "linkedin", state: "CONNECTED", providerDisabled: true });
    expect(destination).not.toHaveProperty("accessTokenCiphertext");
    expect(destination).not.toHaveProperty("accessToken");
  });

  it.each([
    [undefined, "NOT_CONNECTED"],
    ["REAUTH_REQUIRED", "REAUTH_REQUIRED"],
    ["EXTERNAL_APPROVAL_REQUIRED", "EXTERNAL_APPROVAL_REQUIRED"],
    ["HARD_DISABLED", "HARD_DISABLED"],
    ["UNSUPPORTED", "UNSUPPORTED"],
  ])("maps %s status", (status, expected) => {
    expect(toConnectionDestination({ externalId: "dst_1", platform: "reddit", destinationType: "SUBREDDIT", label: "r/example", status }).state).toBe(expected);
  });
});

