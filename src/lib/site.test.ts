import { describe, expect, it } from "vitest";
import { siteOrigin } from "./site";

describe("siteOrigin (QR links)", () => {
  it("uses the configured live site, tidied", () => {
    expect(siteOrigin(' "https://crypto-hunt.vercel.app/" ', "http://localhost:3000")).toBe("https://crypto-hunt.vercel.app");
  });
  it("falls back to this page's address when unset or not a plain origin", () => {
    expect(siteOrigin(undefined, "http://localhost:3000")).toBe("http://localhost:3000");
    expect(siteOrigin("crypto-hunt.vercel.app", "http://localhost:3000")).toBe("http://localhost:3000");
    expect(siteOrigin("https://x.vercel.app/play", "http://localhost:3000")).toBe("http://localhost:3000");
  });
});
