// The live dashboard's view of a snapshot (AdminDashboard.dc.html, T-406). Pure: unit-tested in admin.test.ts.
// The SQL engine decides everything; this only arranges what the captain sees and which controls are valid.
import { TEAM_SIZE } from "@/lib/engine";
import { groupKey, initials, mmss, ordinal, roman } from "@/lib/player/format";
import type { Snapshot, SnapRound, SnapTeam } from "./types";

/** A crew in the same phase this long, while the hunt runs, is flagged as stuck (F13). */
export const STUCK_MS = 10 * 60_000;

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** 2832000 → "00:47:12" */
export function hms(t: number): string {
  const s = Math.max(0, Math.floor(t / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export const started = (g: Snapshot["game"]) => g.status === "RUNNING" || g.status === "PAUSED" || g.status === "FINISHED";

/** Time on the hunt clock: since Start, frozen while paused and at the finish. */
export function huntClock(g: Snapshot["game"], now: number): number | null {
  const start = ms(g.started_at);
  if (!started(g) || Number.isNaN(start)) return null;
  const end = g.status === "PAUSED" ? ms(g.paused_at) : g.status === "FINISHED" ? ms(g.finished_at) : now;
  return Math.max(0, (Number.isNaN(end) ? now : end) - start);
}

/** "00:46:58" on the hunt clock for a log or alert time; the wall clock before the hunt starts. */
export function stamp(iso: string, g: Snapshot["game"]): string {
  const t = ms(iso);
  const start = ms(g.started_at);
  if (!Number.isNaN(start) && t >= start) return hms(t - start);
  const d = new Date(t);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The round the race is deciding now: the lowest round not yet sealed (the last round once all are). */
export function focusRound(rounds: SnapRound[]): SnapRound | null {
  return rounds.find((r) => !r.closed_at) ?? rounds[rounds.length - 1] ?? null;
}

export function penaltyLeft(t: SnapTeam, g: Snapshot["game"], now: number): number {
  const until = ms(t.penalty_until);
  if (Number.isNaN(until)) return 0;
  const ref = g.status === "PAUSED" && g.paused_at ? ms(g.paused_at) : now;
  return Math.max(0, until - ref);
}

/** How long a racing crew has sat in one phase (counting from the last resume), or 0. */
export function stuckFor(t: SnapTeam, g: Snapshot["game"], now: number): number {
  if (g.status !== "RUNNING" || t.status !== "active") return 0;
  if (t.phase !== "SOLVING" && t.phase !== "SEEKING" && t.phase !== "CHECKING_IN") return 0;
  const since = Math.max(ms(t.phase_since), ms(g.resumed_at) || 0);
  if (Number.isNaN(since)) return 0;
  const d = now - since;
  return d >= STUCK_MS ? d : 0;
}

const PHASE_ORDER: Record<string, number> = { SOLVING: 0, SEEKING: 1, CHECKING_IN: 2, PENALTY: 3, COMPLETED: 4 };
const GROUP: Record<string, number> = { finished: 0, active: 1, locked: 1, forming: 1, eliminated: 2, disqualified: 3 };

/** "Sorted by progress": podium, then the race (most rounds, furthest phase, earliest), then the fallen. */
export function sortTeams(teams: SnapTeam[]): SnapTeam[] {
  return [...teams].sort(
    (a, b) =>
      (GROUP[a.status] ?? 9) - (GROUP[b.status] ?? 9) ||
      (a.final_rank ?? 99) - (b.final_rank ?? 99) ||
      (b.status === "eliminated" ? (b.eliminated_in_round ?? 0) - (a.eliminated_in_round ?? 0) : 0) ||
      b.rounds_completed - a.rounds_completed ||
      (PHASE_ORDER[b.phase ?? ""] ?? -1) - (PHASE_ORDER[a.phase ?? ""] ?? -1) ||
      b.pieces_solved - a.pieces_solved ||
      (ms(a.last_completed_at) || Infinity) - (ms(b.last_completed_at) || Infinity) ||
      a.number - b.number,
  );
}

export type ChipTone = "solve" | "seek" | "check" | "pen" | "done" | "out";
export type MemberMark = { i: string; name: string; state: "done" | "wait" | "off" | "gone"; title: string };
export type Card = {
  team: SnapTeam;
  code: string;
  round: string;
  chip: { label: string; tone: ChipTone };
  meta: string;
  members: MemberMark[];
  lead: boolean;
  out: boolean;
  stuckMs: number;
};

const TITLE = { done: "Done", wait: "Waiting", off: "Inactive", gone: "Out" } as const;

export function cardFor(t: SnapTeam, s: Snapshot, now: number, lead = false): Card {
  const g = s.game;
  const out = t.status === "eliminated" || t.status === "disqualified";
  const active = t.members.filter((m) => m.is_active);
  const stuck = stuckFor(t, g, now);
  const prev = t.rounds_completed > 0 && t.last_completed_at
    ? `sealed ${roman(t.rounds_completed)} · ${stamp(t.last_completed_at, g)}`
    : null;

  const done = (m: SnapTeam["members"][number]): boolean => {
    if (!started(g) || !t.phase) return true;
    switch (t.phase) {
      case "SOLVING":
        return m.solved;
      case "CHECKING_IN":
        return m.checked_in;
      default:
        return true;
    }
  };
  const members: MemberMark[] = t.members.map((m) => {
    const state = out ? "gone" : !m.is_active ? "off" : done(m) ? "done" : "wait";
    return { i: initials(m.name, 1), name: m.name, state, title: `${m.name} · ${TITLE[state]}` };
  });
  if (!started(g)) {
    for (let k = members.length; k < TEAM_SIZE; k++)
      members.push({ i: "·", name: "", state: "wait", title: "Empty seat" });
  }

  let chip: Card["chip"];
  let meta: string;
  if (t.status === "finished") {
    const rank = t.final_rank ?? 0;
    chip = { label: `${rank}${ordinal(rank).suffix} place`, tone: "done" };
    meta = t.completion_key ? groupKey(t.completion_key) : "";
  } else if (t.status === "disqualified") {
    chip = { label: "Disqualified", tone: "out" };
    meta = "by the captain";
  } else if (t.status === "eliminated") {
    chip = { label: "Eliminated", tone: "out" };
    meta = t.eliminated_at ? `out at ${stamp(t.eliminated_at, g)}` : `out in ${roman(t.eliminated_in_round ?? 1)}`;
  } else if (!started(g) || !t.phase) {
    const n = t.members.length;
    chip = n >= TEAM_SIZE ? { label: "Crew sealed", tone: "done" } : { label: "Mustering", tone: "solve" };
    meta = `${n}/${TEAM_SIZE} aboard`;
  } else {
    switch (t.phase) {
      case "SEEKING":
        chip = { label: "Seek", tone: "seek" };
        meta = stuck ? `stuck ${Math.floor(stuck / 60_000)}m` : "4/4 pieces";
        break;
      case "CHECKING_IN":
        chip = {
          label: `Check in ${t.members.filter((m) => m.is_active && m.checked_in).length}/${active.length}`,
          tone: "check",
        };
        meta = stuck ? `stuck ${Math.floor(stuck / 60_000)}m` : t.target ? `at ${t.target}` : "";
        break;
      case "PENALTY":
        chip = { label: `Penalty ${mmss(penaltyLeft(t, g, now))}`, tone: "pen" };
        meta = `${t.hints_round} hint${t.hints_round === 1 ? "" : "s"}`;
        break;
      default: {
        chip = { label: `Solve ${t.pieces_solved}/4`, tone: "solve" };
        const opened = t.members.filter((m) => m.opened).length;
        meta = stuck
          ? `stuck ${Math.floor(stuck / 60_000)}m`
          : (prev ?? (t.round === 1 ? `${opened}/${active.length} opened` : ""));
      }
    }
  }
  return {
    team: t,
    code: `T${String(t.number).padStart(2, "0")} · ${t.code}`,
    round: t.round ? roman(t.round) : "—",
    chip,
    meta,
    members,
    lead,
    out,
    stuckMs: stuck,
  };
}

export function cards(s: Snapshot, now: number): Card[] {
  const sorted = sortTeams(s.teams);
  const leader = started(s.game) ? sorted.find((t) => t.status === "active" || t.status === "finished") : undefined;
  return sorted.map((t) => cardFor(t, s, now, t.id === leader?.id));
}

export type Stats = {
  round: SnapRound | null;
  racing: number;
  total: number;
  fallen: number;
  playersLive: number;
  locked: number;
  joined: number;
};

export function stats(s: Snapshot): Stats {
  const racing = s.teams.filter((t) => t.status === "active").length;
  return {
    // Once the hunt is over, the final round is the one that counted.
    round: s.game.status === "FINISHED" ? (s.rounds[s.rounds.length - 1] ?? null) : focusRound(s.rounds),
    racing,
    total: s.teams.length,
    fallen: s.teams.filter((t) => t.status === "eliminated" || t.status === "disqualified").length,
    playersLive: s.teams
      .filter((t) => t.status === "active")
      .reduce((n, t) => n + t.members.filter((m) => m.is_active).length, 0),
    locked: s.teams.filter((t) => t.status === "locked").length,
    joined: s.teams.reduce((n, t) => n + t.members.length, 0),
  };
}

/** Why Start isn't possible yet, or null when the server should accept it (it re-checks everything). */
export function startBlocker(s: Snapshot): string | null {
  const g = s.game;
  if (g.status !== "REGISTRATION" && g.status !== "READY") return null;
  if (s.teams.length === 0) return "Create the crews first.";
  if (s.rounds.length === 0) return "Generate the course first.";
  const short = s.teams.filter((t) => t.status !== "locked");
  if (short.length)
    return `${short.length} crew${short.length === 1 ? " isn't" : "s aren't"} full yet (${short
      .slice(0, 3)
      .map((t) => t.name)
      .join(", ")}${short.length > 3 ? "…" : ""}).`;
  if (s.questions.enabled < 4 * s.rounds.length)
    return `Needs at least ${4 * s.rounds.length} enabled questions (${s.questions.enabled} now).`;
  return null;
}

/**
 * Lowering X to (or below) the crews that already sealed the round closes it at once and eliminates every
 * crew still in it (D-012). Returns how many crews that would knock out, or 0 when nothing closes.
 */
export function closesNow(s: Snapshot, round: SnapRound, x: number): number {
  if (!started(s.game) || s.game.status === "FINISHED" || round.closed_at || x > round.completed) return 0;
  // _close_round: every racing crew whose current round is this one or earlier.
  return s.teams.filter((t) => t.status === "active" && (t.round ?? 0) <= round.number).length;
}

/** Rounds whose X can still change (not sealed). */
export const openRounds = (rounds: SnapRound[]) => rounds.filter((r) => !r.closed_at);
