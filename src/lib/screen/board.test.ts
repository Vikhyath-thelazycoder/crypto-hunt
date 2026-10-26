import { describe, expect, it } from "vitest";
import { finalePub, screenPub } from "@/components/screen/fixtures";
import type { PublicState } from "@/lib/player/types";
import { header, hms, liveRound, phaseText, podium, rows, ships, splashes, ticker, universalQr } from "./board";

const team = (pub: PublicState, id: string) => pub.teams.find((t) => t.id === id)!;

describe("projector header (T-701)", () => {
  it("names the round being decided, how many advance and the seals taken", () => {
    const h = header(screenPub());
    expect(h).toEqual({ kicker: "CRYPTO HUNT · LIVE", title: "Round IV", line: "Four crews advance", seals: { filled: 2, total: 4 } });
  });

  it("says paused, the final round, and crews gathering before the start", () => {
    const p = screenPub();
    expect(header({ ...p, status: "PAUSED", paused: true }).kicker).toBe("CRYPTO HUNT · PAUSED");
    const fin = { ...p, rounds: p.rounds.map((r) => ({ ...r, closed: r.number < 7 })) };
    expect(liveRound(fin)!.number).toBe(7);
    expect(header(fin)).toMatchObject({ title: "The final round", line: "Three crews claim the treasure" });
    expect(header({ ...p, status: "REGISTRATION" })).toMatchObject({ title: "Crews gather", line: "Ten crews aboard", seals: null });
  });
});

describe("leaderboard rows (T-701)", () => {
  it("matches the mockup: six crews in order, the two leaders lit, then the crews out by round", () => {
    const r = rows(screenPub());
    expect(r.map((x) => [x.kind, x.name, x.kind === "crew" ? x.rank : x.phase])).toEqual([
      ["crew", "Salt Wolves", "I"],
      ["crew", "Black Tide", "II"],
      ["crew", "Iron Gulls", "III"],
      ["crew", "Night Herons", "IV"],
      ["crew", "Copper Owls", "V"],
      ["crew", "Rust Anchors", "VI"],
      ["out", "Ember Crows · Grey Moths", "out in III"],
      ["out", "Pale Foxes · Stone Eels", "out in II"],
    ]);
    expect(r.filter((x) => x.kind === "crew" && x.top).map((x) => x.name)).toEqual(["Salt Wolves", "Black Tide"]);
  });

  it("never shrinks the text: 25 crews fold into '+N more crews'", () => {
    const p = screenPub();
    const many = Array.from({ length: 25 }, (_, i) => ({ ...p.teams[0]!, id: `m${i}`, number: i + 1, name: `Crew ${i + 1}` }));
    const r = rows({ ...p, teams: many });
    expect(r).toHaveLength(7);
    expect(r.at(-1)).toMatchObject({ kind: "more", name: "+19 more crews", phase: "racing in Round IV" });
  });

  it("says what each crew is doing, with a live penalty countdown", () => {
    const p = screenPub();
    const now = Date.now();
    expect(phaseText(team(p, "c1"), now)).toBe("Round V · solving");
    expect(phaseText(team(p, "c3"), now)).toBe("Checking in 3/4");
    expect(phaseText(team(p, "c4"), now)).toMatch(/^Penalty 1:1\d$/);
    expect(phaseText(team(p, "c5"), now)).toBe("Seeking the mark");
    expect(phaseText(team(finalePub(), "c3"), now)).toBe("Treasure · 1st");
  });
});

describe("ships on the map (T-702, D-045)", () => {
  it("one ship per racing crew, where the server put it; none for crews that are out", () => {
    const s = ships(screenPub());
    expect(s.map((x) => x.name)).toEqual(["Salt Wolves", "Black Tide", "Iron Gulls", "Night Herons", "Copper Owls", "Rust Anchors"]);
    expect(s[0]).toMatchObject({ x: 0.69, y: 0.27, docked: false, sealed: true });
    expect(s[2]).toMatchObject({ sealed: false });
  });

  it("waits in the harbour until the crew has a closed round, and moves when one closes", () => {
    const p = screenPub();
    const fresh = { ...p, teams: p.teams.map((t) => ({ ...t, ship: null })) };
    const docked = ships(fresh);
    expect(docked.every((x) => x.docked && x.y > 0.85)).toBe(true);
    expect(new Set(docked.map((x) => x.x)).size).toBe(docked.length);
    const sailed = ships({ ...fresh, teams: fresh.teams.map((t) => (t.id === "c1" ? { ...t, ship: { x: 0.3, y: 0.4, round: 1 } } : t)) });
    expect(sailed[0]).toMatchObject({ x: 0.3, y: 0.4, docked: false });
  });

  it("nudges ships that would sit on top of each other", () => {
    const p = screenPub();
    const same = { ...p, teams: p.teams.map((t) => (t.ship ? { ...t, ship: { x: 0.5, y: 0.5, round: 3 } } : t)) };
    const xs = ships(same).map((s) => s.x);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });
});

describe("splashes (T-703) and the finale (T-704)", () => {
  it("a round closing names who advanced and who is out", () => {
    const before = screenPub();
    const after = structuredClone(before);
    after.rounds[3]!.closed = true;
    for (const id of ["c5", "c6"]) Object.assign(team(after, id), { status: "eliminated", eliminated_in_round: 4 });
    for (const id of ["c3", "c4"]) Object.assign(team(after, id), { rounds_completed: 4, round: 5 });
    expect(splashes(before, after)).toEqual([
      { kind: "round", round: 4, advanced: ["Salt Wolves", "Black Tide", "Iron Gulls", "Night Herons"], out: ["Copper Owls", "Rust Anchors"] },
    ]);
  });

  it("a crew knocked out on its own gets its own splash; a finish starts the finale; the end says game over", () => {
    const before = screenPub();
    const after = structuredClone(before);
    Object.assign(team(after, "c6"), { status: "eliminated", eliminated_in_round: 4 });
    expect(splashes(before, after)).toEqual([{ kind: "out", names: ["Rust Anchors"] }]);
    const won = finalePub(false);
    expect(splashes(screenPub(), won)).toContainEqual({ kind: "finish", id: "c3", name: "Iron Gulls", rank: 1 });
    // Rounds closing with the end of the game are told by the Game over splash.
    expect(splashes(won, finalePub(true)).map((s) => s.kind)).toEqual(["finish", "over"]);
  });

  it("nothing on the first read, and nothing when nothing changed", () => {
    expect(splashes(null, screenPub())).toEqual([]);
    expect(splashes(screenPub(), screenPub())).toEqual([]);
  });

  it("the podium is the top 3 in rank order with their times", () => {
    expect(podium(finalePub()).map((p) => [p.rank, p.name, p.time])).toEqual([
      [1, "Iron Gulls", "1:12:40"],
      [2, "Black Tide", "1:14:52"],
      [3, "Salt Wolves", "1:17:05"],
    ]);
    expect(podium(finalePub()).at(0)!.crew).toEqual(["Ana", "Meera", "Ravi", "Josh"]);
    expect(hms(59_999)).toBe("0:00:59");
  });
});

describe("universal QR (T-703) and ticker", () => {
  it("full screen at the start, in a corner later, gone once round 1 closes or the game is not running", () => {
    const t0 = Date.parse("2026-11-01T10:00:00Z");
    const p = { ...screenPub(), universal_token: "tok", started_at: new Date(t0).toISOString() };
    p.rounds[0]!.closed = false;
    expect(universalQr(p, t0 + 60_000)).toBe("full");
    expect(universalQr(p, t0 + 10 * 60_000)).toBe("corner");
    expect(universalQr({ ...p, rounds: p.rounds.map((r) => ({ ...r, closed: true })) }, t0)).toBeNull();
    expect(universalQr({ ...p, universal_token: null }, t0)).toBeNull();
  });

  it("puts the newest happenings into words", () => {
    expect(ticker(screenPub().latest)).toBe(
      "Night Herons serving a 4:00 penalty · Copper Owls lifted the fog · Black Tide sealed Round IV",
    );
    expect(ticker([{ kind: "finished", team: "Iron Gulls", round: null, rank: 1, ms: null, at: "" }])).toBe(
      "Iron Gulls claimed the treasure · 1st",
    );
    expect(ticker([{ kind: "scanned", team: "X", round: 1, rank: null, ms: null, at: "" }])).toBe("");
  });
});
