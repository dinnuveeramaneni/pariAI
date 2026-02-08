import { describe, expect, it } from "vitest";
import {
  generateApiKey,
  hashApiSecret,
  parseApiKey,
  verifyApiKey,
} from "@/lib/api-key";

describe("api-key utilities", () => {
  it("generates a key with prefix and hash", () => {
    const generated = generateApiKey();
    expect(generated.plaintext.startsWith("cja_")).toBe(true);
    expect(generated.prefix.length).toBeGreaterThan(0);
    expect(generated.secretHash.length).toBe(64);
  });

  it("parses a valid key format", () => {
    const parsed = parseApiKey("cja_abcd1234_secretvalue");
    expect(parsed).toEqual({ prefix: "abcd1234", secret: "secretvalue" });
  });

  it("fails parsing invalid format", () => {
    expect(parseApiKey("bad_key")).toBeNull();
  });

  it("verifies hash using timing-safe compare", () => {
    const secret = "my-secret";
    const hash = hashApiSecret(secret);
    expect(verifyApiKey(`cja_testprefix_${secret}`, hash)).toBe(true);
    expect(verifyApiKey("cja_testprefix_wrong", hash)).toBe(false);
  });
});
