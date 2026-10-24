import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_xyz",
};

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload))}.sig`;

describe("parsePublicEnv", () => {
  it("accepts a complete public env", () => {
    expect(parsePublicEnv(valid).NEXT_PUBLIC_SUPABASE_URL).toBe("https://abc.supabase.co");
  });

  it("fails fast naming every missing variable", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("rejects a non-URL Supabase URL", () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("forgives quotes and spaces pasted into a hosting dashboard", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "'https://abc.supabase.co'",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: " sb_publishable_xyz\n",
    });
    expect(env).toEqual(valid);
  });

  it("refuses an sb_secret_ key in the public slot", () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_leak" })).toThrow(
      /secret/i,
    );
  });

  it("refuses a legacy service_role JWT but accepts a legacy anon JWT", () => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "service_role" }) }),
    ).toThrow(/secret/i);
    expect(parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon" }) })).toBeTruthy();
  });
});
