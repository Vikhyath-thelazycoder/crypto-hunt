import { describe, expect, it } from "vitest";
import { KEY_ALPHABET, KEY_LENGTH, normalizeKey } from "./keys";

describe("key alphabet", () => {
  it("has no look-alike characters", () => {
    for (const c of ["0", "O", "1", "I"]) expect(KEY_ALPHABET).not.toContain(c);
  });

  it("gives about a billion 6-character keys", () => {
    expect(KEY_ALPHABET.length ** KEY_LENGTH).toBeGreaterThan(1e9);
    expect(new Set(KEY_ALPHABET).size).toBe(KEY_ALPHABET.length);
  });

  it("normalizes case and drops characters a key can't have", () => {
    expect(normalizeKey(" k7-pw 0o1i x ")).toBe("K7PWX");
  });
});
