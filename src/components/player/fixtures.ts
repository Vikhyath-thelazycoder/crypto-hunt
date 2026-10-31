// Sample statuses with the mockups' data (Iron Gulls · Ana, Meera, Ravi, Josh · Round III of VII), shared by
// the dev screen preview (/dev/screens) and the screen tests.
import type { Member, MyStatus, PublicState } from "@/lib/player/types";

export const names = ["Ana", "Meera", "Ravi", "Josh"];
export const members = (checked: number, solved: number): Member[] =>
  names.map((name, i) => ({
    id: `m${i}`,
    name,
    is_active: true,
    me: name === "Ravi",
    solved: i < solved,
    checked_in: i < checked,
  }));
export const CLUE = [
  "Where pages sleep in rows of oak,",
  "beneath the third arch, look low —",
  "the stone that rings hollow",
  "keeps the mark.",
];

export const base: MyStatus = {
  ok: true,
  player: { id: "m2", name: "Ravi", is_active: true },
  team: {
    id: "t7",
    number: 7,
    name: "Iron Gulls",
    code: "HX7RMK",
    status: "active",
    final_rank: null,
    eliminated_in_round: null,
    eliminated_view: null,
    completion_key: null,
    named: true,
    can_name: false,
  },
  game: {
    status: "RUNNING",
    hints_enabled: true,
    broadcast: null,
    broadcast_at: null,
    hint_penalty_ms: 60000,
    wrong_penalty_ms: 60000,
  },
  members: members(0, 2),
  round: { number: 3, total: 7, is_final: false, difficulty: 3 },
  phase: "SOLVING",
  penalty: { ms: 0, until: null },
  task: {
    id: "task",
    opened: true,
    solved: false,
    hint_used: false,
    has_hint: true,
    text: "Which river flows through more countries than any other on Earth?",
    format: "text",
    options: null,
    hint: null,
    category: "Geography",
    difficulty: 3,
    piece_index: 1,
    strikes: 0,
  },
  pieces: [
    { index: 0, solved: true, text: CLUE[0]!, by: "Ana", mine: false, hint: false },
    { index: 1, solved: false, text: null, by: "Ravi", mine: true, hint: false },
    { index: 2, solved: true, text: CLUE[2]!, by: "Meera", mine: false, hint: true },
    { index: 3, solved: false, text: null, by: "Josh", mine: false, hint: true },
  ],
  region: null,
  seal_code: null,
};
export const solvedPieces = base.pieces.map((p, i) => ({ ...p, solved: true, text: CLUE[i]! }));
export const seeking: MyStatus = {
  ...base,
  phase: "SEEKING",
  members: members(0, 4),
  pieces: solvedPieces,
  region: { x: 0.81, y: 0.55, r: 0.1 },
};
export const final: MyStatus = {
  ...seeking,
  round: { number: 7, total: 7, is_final: true, difficulty: 5 },
  seal_code: "W7KQ3T",
};
export const pub: PublicState = {
  status: "RUNNING",
  paused: false,
  broadcast: null,
  broadcast_at: null,
  finished_at: null,
  total_rounds: 7,
  rounds: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    number: n,
    advance: Math.max(3, 11 - n),
    is_final: n === 7,
    closed: n < 4,
    completed: 0,
  })),
  teams: [
    "Salt Wolves",
    "Black Tide",
    "Night Herons",
    "Copper Owls",
    "Rust Anchors",
    "Pale Foxes",
    "Iron Gulls",
    "Ember Crows",
    "Grey Moths",
    "Stone Eels",
  ].map((name, i) => ({
    id: name === "Iron Gulls" ? "t7" : `x${i}`,
    number: i + 1,
    name,
    status: i < 6 ? "active" : "eliminated",
    final_rank: null,
    eliminated_in_round: i < 6 ? null : 4,
    round: i < 6 ? 5 : 4,
    phase: i < 6 ? "SOLVING" : "ELIMINATED",
    members: 4,
    rounds_completed: i < 6 ? 4 : 3,
    checked_in: 0,
  })),
};
