import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { constantTimeEqual, decryptConnectionSecret, encryptConnectionSecret, redactConnectionSecret } from "./token-crypto";

const key = randomBytes(32).toString("base64");

describe("shared connection token crypto", () => {
  it("encrypts and decrypts secrets without exposing plaintext", () => {
    const ciphertext = encryptConnectionSecret("refresh-secret", key);
    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain("refresh-secret");
    expect(decryptConnectionSecret(ciphertext, key)).toBe("refresh-secret");
  });

  it("fails closed for missing or invalid keys and tampered payloads", () => {
    expect(() => encryptConnectionSecret("secret", "")).toThrow(/32-byte/);
    expect(() => decryptConnectionSecret("v1.bad.bad.bad", key)).toThrow();
    expect(() => decryptConnectionSecret(encryptConnectionSecret("secret", key), randomBytes(32).toString("base64"))).toThrow();
  });

  it("redacts values and compares state values without returning secrets", () => {
    expect(redactConnectionSecret("oauth-access-token")).toMatch(/^\[redacted:[0-9a-f]{12}\]$/);
    expect(redactConnectionSecret("oauth-access-token")).not.toContain("oauth-access-token");
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "different")).toBe(false);
  });
});
