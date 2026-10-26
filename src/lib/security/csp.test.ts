import { describe, expect, it } from "vitest";
import { buildCsp, staticSecurityHeaders } from "./csp";

const parse = (csp: string) =>
  Object.fromEntries(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values];
    }),
  ) as Record<string, string[]>;

describe("buildCsp", () => {
  const prod = parse(buildCsp({ nonce: "abc", supabaseUrl: "https://ref.supabase.co", dev: false }));

  it("allows scripts only from self and the request nonce", () => {
    expect(prod["script-src"]).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(prod["script-src"]).not.toContain("'unsafe-inline'");
    expect(prod["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("lets the app reach only its own Supabase project over https and wss", () => {
    expect(prod["connect-src"]).toEqual(["'self'", "blob:", "https://ref.supabase.co", "wss://ref.supabase.co"]);
  });

  it("blocks framing, plugins and foreign form posts", () => {
    expect(prod["frame-ancestors"]).toEqual(["'none'"]);
    expect(prod["object-src"]).toEqual(["'none'"]);
    expect(prod["form-action"]).toEqual(["'self'"]);
    expect(prod["base-uri"]).toEqual(["'self'"]);
  });

  it("adds eval and dev websockets only in development", () => {
    const dev = parse(buildCsp({ nonce: "abc", supabaseUrl: "https://ref.supabase.co", dev: true }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toContain("ws:");
  });
});

describe("staticSecurityHeaders", () => {
  const headers = Object.fromEntries(staticSecurityHeaders().map((h) => [h.key, h.value]));

  it("sets every hardening header", () => {
    expect(Object.keys(headers).sort()).toEqual(
      [
        "Cross-Origin-Opener-Policy",
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ].sort(),
    );
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("allows the camera for the scanner and nothing else", () => {
    expect(headers["Permissions-Policy"]).toContain("camera=(self)");
    expect(headers["Permissions-Policy"]).toContain("microphone=()");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
  });
});
