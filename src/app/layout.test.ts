import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("root layout", () => {
  it("renders per request so scripts get the CSP nonce (static pages would be blocked)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(src).toMatch(/await headers\(\)/);
  });
});
