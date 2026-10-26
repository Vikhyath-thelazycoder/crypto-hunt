// Crews name themselves (D-044): the first member to join names the crew once, before the hunt. Everyone in the
// crew sees it; names are checked and unique; the captain's rename overrides and locks it; New Game unlocks it.
import { beforeAll, describe, expect, it } from "vitest";
import { anon, applyPlan, call, getAdmin, raises, resetWorld, seedVenue, service, setupTeams, status, type Player } from "./harness";

let A: Player[];
let B: Player[];
let teamIds: string[];
let locations: string[];
const admin = async () => (await getAdmin()).client;
type Named = { team: { name: string; named: boolean; can_name: boolean } };
const team = async (p: Player) => ((await status(p)) as unknown as Named).team;

beforeAll(async () => {
  await resetWorld();
  locations = await seedVenue(12, 40);
  const { teams, players } = await setupTeams(2);
  [A, B] = players as [Player[], Player[]];
  teamIds = teams.map((t) => t.id);
});

describe("naming a crew (D-044)", () => {
  it("only the first member to join may name it", async () => {
    expect(await team(A[0]!)).toMatchObject({ named: false, can_name: true });
    expect(await team(A[1]!)).toMatchObject({ named: false, can_name: false });
    expect((await call(A[1]!.client, "name_crew", { p_name: "Late Sailors" })).code).toBe("NOT_FIRST");
  });

  it("refuses bad names: too short, too long, odd characters", async () => {
    for (const bad of ["X", "A".repeat(25), "<script>", "  ", "Crew; drop"])
      expect((await call(A[0]!.client, "name_crew", { p_name: bad })).code).toBe("BAD_CREW_NAME");
  });

  it("names the crew; every member sees it, and it can't be changed again by the crew", async () => {
    const r = await call(A[0]!.client, "name_crew", { p_name: "  Code   Pirates " });
    expect(r).toMatchObject({ ok: true, name: "Code Pirates" });
    for (const p of A) expect(await team(p)).toMatchObject({ name: "Code Pirates", named: true, can_name: false });
    expect((await call(A[0]!.client, "name_crew", { p_name: "Other Name" })).code).toBe("ALREADY_NAMED");
    const { data } = await service.from("events").select("kind, data").eq("kind", "crew_named").single();
    expect(data!.data).toMatchObject({ name: "Code Pirates" });
  });

  it("another crew can't take the same name, whatever the case", async () => {
    expect((await call(B[0]!.client, "name_crew", { p_name: "code PIRATES" })).code).toBe("CREW_NAME_TAKEN");
    expect(await call(B[0]!.client, "name_crew", { p_name: "Salt & Iron" })).toMatchObject({ ok: true });
  });

  it("the captain's rename overrides and locks the name", async () => {
    await call(await admin(), "rename_team", { p_team: teamIds[1], p_name: "Iron Gulls" });
    expect(await team(B[0]!)).toMatchObject({ name: "Iron Gulls", named: true, can_name: false });
  });

  it("players can't write the name directly, and anonymous callers can't call name_crew", async () => {
    const w = await A[0]!.client.from("teams").update({ name: "Hacked" }).eq("id", teamIds[0]!).select("id");
    expect(w.data ?? []).toHaveLength(0);
    expect(await raises(anon(), "name_crew", { p_name: "Ghost Crew" })).toMatch(/permission denied|NOT_REGISTERED|NOT_AUTHENTICATED/);
  });

  it("after the hunt starts the name is set", async () => {
    await service.from("teams").update({ named: false }).eq("id", teamIds[0]!);
    await applyPlan(teamIds, locations, { counts: [3, 1], advance: [2, 2] });
    await call(await admin(), "start_game");
    expect(await team(A[0]!)).toMatchObject({ can_name: false });
    expect((await call(A[0]!.client, "name_crew", { p_name: "Too Late" })).code).toBe("GAME_STARTED");
  });

  it("New Game gives the crews new codes and lets the next first member name them again", async () => {
    await call(await admin(), "start_new_game", { p_confirm: "NEW GAME", p_regenerate_qr: false });
    const { data } = await service.from("teams").select("named").in("id", teamIds);
    expect(data!.every((t) => t.named === false)).toBe(true);
  });
});
