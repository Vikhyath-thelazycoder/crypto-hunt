// The admin console's server side (P4): the dashboard snapshot, every override with its audit row (T13), alert
// acknowledgement, and the venue map in Storage (admin writes, anyone reads; T-403).
import { beforeAll, describe, expect, it } from "vitest";
import {
  anon,
  applyPlan,
  call,
  checkInAll,
  getAdmin,
  qrFor,
  raises,
  resetWorld,
  seedVenue,
  service,
  setupTeams,
  solveAll,
  status,
  TEST_URL,
  universalToken,
  type Player,
} from "./harness";

let A: Player[];
let B: Player[];
let C: Player[];
let ids: string[];
let locations: string[];
const admin = async () => (await getAdmin()).client;

type Snap = {
  game: { status: string };
  rounds: { number: number; advance: number; completed: number }[];
  teams: {
    id: string;
    name: string;
    status: string;
    round: number | null;
    phase: string | null;
    target: string | null;
    pieces_solved: number;
    members: { id: string; name: string; is_active: boolean; opened: boolean; solved: boolean }[];
  }[];
  alerts: { id: number; kind: string; team: string | null; player: string | null; place: string | null; data: Record<string, unknown> }[];
  open_alerts: number;
  open_by_kind: Record<string, number>;
  pranks: { total: number; top_team: string | null };
  log: { src: string; kind: string; reason: string | null; target: string | null; team: string | null }[];
  course: { marks: number; pranks: number; spares: number; universal: boolean };
  questions: { enabled: number; by_difficulty: Record<string, number> };
  locations: number;
};
const snap = async () => call<Snap>(await admin(), "admin_snapshot");

async function audit(action: string) {
  const { data, error } = await service.from("admin_audit").select("*").eq("action", action).order("id", { ascending: false }).limit(1);
  if (error) throw error;
  return data[0] as { action: string; target: string; reason: string | null; data: Record<string, unknown> } | undefined;
}

beforeAll(async () => {
  await resetWorld();
  locations = await seedVenue(20, 80);
  const { teams, players } = await setupTeams(3);
  [A, B, C] = players as [Player[], Player[], Player[]];
  ids = teams.map((t) => t.id);
  await applyPlan(ids, locations, { counts: [5, 3, 2, 1], advance: [3, 3, 2, 2] });
});

describe("admin_snapshot (T-406)", () => {
  it("is for the captain only", async () => {
    expect(await raises(A[0]!.client, "admin_snapshot")).toBe("NOT_ADMIN");
    expect(await raises(anon(), "admin_snapshot")).toMatch(/permission denied/);
    expect(await raises(A[0]!.client, "ack_all_alerts")).toBe("NOT_ADMIN");
  });

  it("before Start: crews with their members, the course and question counts", async () => {
    const s = await snap();
    expect(s.game.status).toBe("READY");
    expect(s.teams).toHaveLength(3);
    expect(s.teams.every((t) => t.status === "locked" && t.members.length === 4 && t.phase === null)).toBe(true);
    expect(s.course).toEqual({ marks: 11, pranks: 2, spares: 2, universal: true });
    expect(s.questions.enabled).toBe(80);
    expect(Object.values(s.questions.by_difficulty).reduce((a, b) => a + b, 0)).toBe(80);
    expect(s.locations).toBe(20);
    expect(s.log.some((l) => l.src === "audit" && l.kind === "apply_game_plan")).toBe(true);
  });

  it("live: progress per crew, open alerts with the place behind the mark, the log", async () => {
    await call(await admin(), "start_game");
    const u = await universalToken();
    await call(A[0]!.client, "scan_qr", { p_token: u });
    // A later-round mark (the final) scanned in round 1: sealed, alerted with its place.
    const { data: fin } = await service.from("qr_codes").select("token, label, locations(name)").eq("kind", "final").single();
    await call(A[1]!.client, "scan_qr", { p_token: fin!.token });
    const { data: prank } = await service.from("qr_codes").select("token").eq("kind", "prank").limit(1).single();
    await call(B[0]!.client, "scan_qr", { p_token: prank!.token });

    const s = await snap();
    const a = s.teams.find((t) => t.id === ids[0])!;
    expect([a.status, a.round, a.phase]).toEqual(["active", 1, "SOLVING"]);
    expect(a.target).toBe((await qrFor(ids[0]!, 1)).label);
    expect(a.members.find((m) => m.id === A[0]!.playerId)?.opened).toBe(true);
    expect(a.members.find((m) => m.id === A[2]!.playerId)?.opened).toBe(false);
    const locked = s.alerts.find((x) => x.kind === "locked_scan")!;
    expect(locked.team).toBe(s.teams[0]!.name);
    expect(locked.player).toBe(A[1]!.name);
    expect(locked.place).toBe((fin!.locations as unknown as { name: string }).name);
    expect(locked.data).toMatchObject({ qr: "F-01", qr_round: 4, team_round: 1, own_future: true });
    expect(s.open_by_kind.locked_scan).toBe(1);
    expect(s.pranks.total).toBe(1);
    expect(s.pranks.top_team).toBe(s.teams[1]!.name);
    expect(s.log.some((l) => l.kind === "game_started")).toBe(true);
    expect(s.log.some((l) => l.kind.startsWith("alert:"))).toBe(false);
  });

  it("ack_all_alerts clears the rail", async () => {
    const n = await call<number>(await admin(), "ack_all_alerts");
    expect(n).toBeGreaterThanOrEqual(2);
    expect((await snap()).open_alerts).toBe(0);
  });
});

describe("overrides need a reason and are audited (T-408, T13)", () => {
  it("a short reason is refused", async () => {
    expect(await raises(await admin(), "set_member_inactive", { p_player: A[3]!.playerId, p_inactive: true, p_reason: "x" })).toBe(
      "REASON_REQUIRED",
    );
  });

  it("mark a member inactive: their piece unlocks and the crew needs only three at the mark", async () => {
    await call(await admin(), "set_member_inactive", { p_player: A[3]!.playerId, p_inactive: true, p_reason: "phone died" });
    const row = await audit("set_member_inactive");
    expect([row?.target, row?.reason, row?.data.inactive]).toEqual([A[3]!.playerId, "phone died", true]);
    await solveAll(A.slice(0, 3));
    expect((await status(A[0]!)).phase).toBe("SEEKING");
    const s = await snap();
    expect(s.log.find((l) => l.src === "audit" && l.kind === "set_member_inactive")?.reason).toBe("phone died");
    const t = s.teams.find((x) => x.id === ids[0])!;
    expect(t.pieces_solved).toBe(4);
    expect(t.members.find((m) => m.id === A[3]!.playerId)?.is_active).toBe(false);
  });

  it("re-point to a spare: the crew's route follows the spare's links", async () => {
    const { data: spare } = await service.from("qr_codes").select("id, label, token, key").eq("round", 1).eq("is_spare", true).limit(1).single();
    await call(await admin(), "repoint_team", { p_team: ids[0], p_qr: spare!.id, p_reason: "card torn" });
    expect((await audit("repoint_team"))?.reason).toBe("card torn");
    expect((await qrFor(ids[0]!, 1)).label).toBe(spare!.label);
    const { data: link } = await service.from("qr_links").select("to_qr").eq("from_qr", spare!.id).single();
    const { data: next } = await service.from("assignments").select("qr_id").eq("team_id", ids[0]).eq("round", 2).single();
    expect(next!.qr_id).toBe(link!.to_qr);
    // The three active members check in at the new mark: round 1 sealed.
    await checkInAll(A.slice(0, 3));
    expect((await status(A[0]!)).round?.number).toBe(2);
  });

  it("move a crew back to restart a round", async () => {
    await call(await admin(), "move_team", { p_team: ids[0], p_round: 1, p_reason: "wrong mark hidden" });
    const row = await audit("move_team");
    expect([row?.reason, row?.data.round]).toEqual(["wrong mark hidden", 1]);
    const s = await status(A[0]!);
    expect([s.round?.number, s.phase]).toEqual([1, "SOLVING"]);
  });

  it("complete a round by hand, in completion order", async () => {
    const res = await call<{ completed: boolean; round: number; order: number }>(await admin(), "force_complete", {
      p_team: ids[1],
      p_reason: "QR stolen, verified by staff",
    });
    expect(res).toMatchObject({ completed: true, round: 1 });
    expect((await audit("force_complete"))?.reason).toBe("QR stolen, verified by staff");
    expect((await status(B[0]!)).round?.number).toBe(2);
  });

  it("kick a player: their seat empties and their account is gone", async () => {
    await call(await admin(), "kick_player", { p_player: C[3]!.playerId, p_reason: "left the event" });
    const row = await audit("kick_player");
    expect([row?.reason, row?.data.name]).toEqual(["left the event", C[3]!.name]);
    const { count } = await service.from("players").select("id", { count: "exact", head: true }).eq("team_id", ids[2]);
    expect(count).toBe(3);
    const s = await snap();
    expect(s.alerts.some((a) => a.kind === "kicked")).toBe(true);
  });

  it("disqualify: the crew is out at once and the log says why", async () => {
    await call(await admin(), "disqualify_team", { p_team: ids[2], p_reason: "swapped phones with another crew" });
    expect((await audit("disqualify_team"))?.reason).toBe("swapped phones with another crew");
    const s = await snap();
    const t = s.teams.find((x) => x.id === ids[2])!;
    expect([t.status, t.phase]).toEqual(["disqualified", "ELIMINATED"]);
    expect(s.log.find((l) => l.src === "audit" && l.kind === "disqualify_team")?.team).toBe(t.name);
    expect((await call(C[0]!.client, "scan_qr", { p_token: await universalToken() })).code).toBe("ELIMINATED");
  });

  it("set X is audited with its round", async () => {
    await call(await admin(), "set_advance_count", { p_round: 2, p_x: 2 });
    const row = await audit("set_advance_count");
    expect([row?.target, row?.data.x]).toEqual(["2", 2]);
    const s = await snap();
    expect(s.rounds.find((r) => r.number === 2)?.advance).toBe(2);
    expect(s.log.find((l) => l.src === "audit" && l.kind === "set_advance_count")?.target).toBe("2");
  });

  it("a crew can't be removed mid-hunt", async () => {
    expect(await raises(await admin(), "delete_team", { p_team: ids[0], p_reason: "testing removal" })).toBe("GAME_STARTED");
  });
});

describe("venue content (T-403)", () => {
  it("a location in the current course can't be deleted; a free one can", async () => {
    const adm = await admin();
    const { data: used } = await service.from("qr_codes").select("location_id").eq("kind", "target").limit(1).single();
    const r = await adm.from("locations").delete().eq("id", used!.location_id).select("id");
    expect(r.error?.message).toMatch(/foreign key/);
    const { data: inCourse } = await service.from("qr_codes").select("location_id").not("location_id", "is", null);
    const free = locations.find((l) => !inCourse!.some((q) => q.location_id === l))!;
    const ok = await adm.from("locations").delete().eq("id", free).select("id");
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
  });

  it("players can't write locations or the venue map", async () => {
    const p = A[0]!.client;
    const ins = await p.from("locations").insert({ name: "Sneaky", clue_pieces: ["a", "b", "c", "d"] }).select("id");
    expect(ins.error ?? (ins.data?.length === 0 ? "none" : null)).toBeTruthy();
    const vm = await p.from("venue_map").upsert({ id: 1, image_path: "x.png", width: 1, height: 1 }).select("id");
    expect(vm.error ?? (vm.data?.length === 0 ? "none" : null)).toBeTruthy();
  });

  it("the venue image: only the admin uploads; anyone can load it; the admin replaces it", async () => {
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
      (c) => c.charCodeAt(0),
    );
    const path = `itest-${Date.now()}.png`;
    const byPlayer = await A[0]!.client.storage.from("venue").upload(path, png, { contentType: "image/png" });
    expect(byPlayer.error).toBeTruthy();
    const byAnon = await anon().storage.from("venue").upload(path, png, { contentType: "image/png" });
    expect(byAnon.error).toBeTruthy();

    const adm = await admin();
    const up = await adm.storage.from("venue").upload(path, png, { contentType: "image/png" });
    expect(up.error).toBeNull();
    const map = await adm.from("venue_map").upsert({ id: 1, image_path: path, width: 1, height: 1 }).select("*").single();
    expect(map.error).toBeNull();
    const res = await fetch(`${TEST_URL}/storage/v1/object/public/venue/${path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
    const notImage = await adm.storage.from("venue").upload(`itest-${Date.now()}.txt`, new Blob(["hi"]), { contentType: "text/plain" });
    expect(notImage.error).toBeTruthy();
    const del = await adm.storage.from("venue").remove([path]);
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);
    await service.from("venue_map").delete().eq("id", 1);
  });
});
