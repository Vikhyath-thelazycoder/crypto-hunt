import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Reads the real tokens so the check can't drift from the stylesheet (DESIGN.md › Accessibility).
// jsdom gives import.meta.url an http scheme, so resolve from the project root vitest runs in.
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m?.[1]) throw new Error(`token --color-${name} missing`);
  return m[1];
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("colour contrast", () => {
  const textPairs: [string, string, number][] = [
    ["ink", "parchment", 10],
    ["ink", "parchment-deep", 4.5],
    ["sepia", "parchment", 4.5],
    ["sepia-ink", "parchment", 4.5],
    ["sepia-ink", "parchment-deep", 4.5],
    ["wax", "parchment", 4.5],
    ["sea", "parchment", 4.5],
    ["wax-text", "wax", 4.5],
    ["parchment", "night", 4.5],
    ["gold", "night", 4.5],
  ];

  it.each(textPairs)("%s on %s ≥ %s:1", (fg, bg, min) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
  });
});
