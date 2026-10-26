import type { PublicState, PublicTeam } from "@/lib/player/types";

// The ScreenLive / ScreenFinale mockups' sample race (docs/design/screens), as a public state, for /dev/screens and tests.

const crew = (n: number, name: string, t: Partial<PublicTeam>): PublicTeam => ({
  id: `c${n}`,
  number: n,
  name,
  status: "active",
  final_rank: null,
  eliminated_in_round: null,
  round: 4,
  phase: "SOLVING",
  members: 4,
  rounds_completed: 3,
  checked_in: 0,
  penalty_until: null,
  ship: null,
  ...t,
});

const out = (n: number, name: string, round: number) =>
  crew(n, name, { status: "eliminated", eliminated_in_round: round, round, phase: "ELIMINATED", rounds_completed: round - 1 });

export const screenPub = (): PublicState => ({
  status: "RUNNING",
  paused: false,
  broadcast: null,
  broadcast_at: null,
  finished_at: null,
  started_at: new Date(Date.now() - 52 * 60_000).toISOString(),
  universal_token: null,
  total_rounds: 7,
  rounds: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    number: n,
    advance: [8, 6, 5, 4, 4, 3, 3][n - 1]!,
    is_final: n === 7,
    closed: n < 4,
    completed: n < 4 ? [8, 6, 5][n - 1]! : n === 4 ? 2 : 0,
  })),
  map: { path: "campus-map.jpg", w: 1800, h: 792 },
  teams: [
    crew(1, "Salt Wolves", { round: 5, rounds_completed: 4, ship: { x: 0.69, y: 0.27, round: 3 } }),
    crew(2, "Black Tide", { round: 5, rounds_completed: 4, ship: { x: 0.22, y: 0.2, round: 3 } }),
    crew(3, "Iron Gulls", { phase: "CHECKING_IN", checked_in: 3, ship: { x: 0.84, y: 0.55, round: 3 } }),
    crew(4, "Night Herons", {
      phase: "PENALTY",
      penalty_until: new Date(Date.now() + 72_000).toISOString(),
      ship: { x: 0.84, y: 0.14, round: 3 },
    }),
    crew(5, "Copper Owls", { phase: "SEEKING", ship: { x: 0.52, y: 0.46, round: 3 } }),
    crew(6, "Rust Anchors", { ship: { x: 0.58, y: 0.8, round: 3 } }),
    out(7, "Ember Crows", 3),
    out(8, "Grey Moths", 3),
    out(9, "Pale Foxes", 2),
    out(10, "Stone Eels", 2),
  ],
  latest: [
    { kind: "penalty_started", team: "Night Herons", round: null, rank: null, ms: 240_000, at: new Date().toISOString() },
    { kind: "clue_complete", team: "Copper Owls", round: 4, rank: null, ms: null, at: new Date().toISOString() },
    { kind: "round_completed", team: "Black Tide", round: 4, rank: null, ms: null, at: new Date().toISOString() },
  ],
});

/** The finale mockup: Iron Gulls 1st, Black Tide 2nd, Salt Wolves 3rd. */
export const finalePub = (over = true): PublicState => {
  const p = screenPub();
  const won = (id: string, rank: number, ms: number, names: string[]) => {
    const t = p.teams.find((x) => x.id === id)!;
    Object.assign(t, { status: "finished", final_rank: rank, phase: "FINISHED", rounds_completed: 7, finish_ms: ms, crew: names });
  };
  won("c3", 1, 4_360_000, ["Ana", "Meera", "Ravi", "Josh"]);
  won("c2", 2, 4_492_000, ["Kiran", "Sam", "Leela", "Omar"]);
  if (over) won("c1", 3, 4_625_000, ["Dev", "Ira", "Noor", "Tom"]);
  p.teams.sort((a, b) => (a.final_rank ?? 9) - (b.final_rank ?? 9));
  return { ...p, status: over ? "FINISHED" : "RUNNING", rounds: p.rounds.map((r) => ({ ...r, closed: over || r.closed })) };
};
