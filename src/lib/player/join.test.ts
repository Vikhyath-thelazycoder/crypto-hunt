import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  publicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "https://db.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }),
}));
vi.mock("@/lib/supabase/client", () => ({ getBrowserSupabase: () => ({}) }));

import { previewCrew } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("join function call (F-04)", () => {
  it("tries once more when the function fails to boot, then reports the result", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "BOOT_ERROR" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, team: { name: "Iron Gulls" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const r = await previewCrew("ABCDEF");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ok: true, team: { name: "Iron Gulls" } });
  });

  it("gives up after the second failure with SERVER", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await previewCrew("ABCDEF")).toEqual({ ok: false, code: "SERVER" });
  });

  it("does not retry an answer the function gave (a refused code)", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, code: "BAD_CODE" }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    expect(await previewCrew("ABCDEF")).toEqual({ ok: false, code: "BAD_CODE" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
