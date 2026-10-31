import { describe, expect, it } from "vitest";
import { backupDelay } from "./usePlayer";

describe("backupDelay (T-1005, T-1006)", () => {
  it("checks every 60 s when live and 30 s when the live connection is down", () => {
    expect(backupDelay(0, true, 0.5)).toBe(60_000);
    expect(backupDelay(0, false, 0.5)).toBe(30_000);
  });
  it("waits longer after each failure, up to 60 s", () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((f) => backupDelay(f, true, 0.5))).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });
  it("spreads phones ±30 % so they never line up", () => {
    expect(backupDelay(0, true, 0)).toBeCloseTo(42_000);
    expect(backupDelay(0, true, 1)).toBeCloseTo(78_000);
  });
});
