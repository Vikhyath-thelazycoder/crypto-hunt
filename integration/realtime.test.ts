// T-208: live updates reach the projector and phones, and RLS filters what each subscriber receives.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { anon, applyPlan, call, getAdmin, resetWorld, seedVenue, setupTeams, type Player } from "./harness";

let crews: Player[][];
const channels: RealtimeChannel[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Subscribes to a table's changes; the returned array fills as payloads arrive. */
async function listen(client: SupabaseClient, table: string, token?: string) {
  if (token) client.realtime.setAuth(token);
  const got: Record<string, unknown>[] = [];
  const ch = client
    .channel(`t-${table}-${Math.random()}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, (p) =>
      got.push(p.new as Record<string, unknown>),
    );
  channels.push(ch);
  await new Promise<void>((resolve, reject) => {
    ch.subscribe((s) =>
      s === "SUBSCRIBED" ? resolve() : s === "CHANNEL_ERROR" ? reject(new Error(s)) : undefined,
    );
  });
  // Realtime starts streaming changes shortly after SUBSCRIBED.
  await wait(1500);
  return got;
}

beforeAll(async () => {
  await resetWorld();
  const locations = await seedVenue(20, 60);
  const { teams, players } = await setupTeams(2);
  crews = players;
  await applyPlan(
    teams.map((t) => t.id),
    locations,
  );
  await call((await getAdmin()).client, "start_game");
});

afterAll(async () => {
  for (const ch of channels) await ch.unsubscribe();
});

describe("realtime", () => {
  it("the projector (anonymous) receives public_state when the admin broadcasts", async () => {
    const screen = anon();
    const got = await listen(screen, "public_state");
    await call((await getAdmin()).client, "broadcast", { p_text: "Round two opens soon" });
    const arrived = () => got.some((row) => JSON.stringify(row).includes("Round two opens soon"));
    for (let i = 0; i < 40 && !arrived(); i++) await wait(250);
    expect(arrived()).toBe(true);
  });

  it("a phone receives only its own team's progress row", async () => {
    const me = crews[0]![0]!;
    const { data } = await me.client.auth.getSession();
    const got = await listen(me.client, "team_state", data.session!.access_token);
    // Both teams change: the admin moves each back to round 1 (an audited override).
    const admin = (await getAdmin()).client;
    for (const crew of crews) {
      await call(admin, "move_team", { p_team: crew[0]!.teamId, p_round: 1, p_reason: "realtime test" });
    }
    await wait(3000);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((row) => row.team_id === me.teamId)).toBe(true);
  });
});
