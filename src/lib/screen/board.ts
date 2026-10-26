import { mmss, ordinal, roman } from "@/lib/player/format";
import type { PublicEvent, PublicState, PublicTeam } from "@/lib/player/types";

// What the projector (/screen, P7) draws, worked out from the public state alone (names and progress, never a
// place, key or code). Pure functions, so the screen and its tests agree.

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const word = (n: number) => WORDS[n] ?? String(n);

/** Flag colours from the mockup, then more in the same family for big hunts (picked by crew number). */
export const SHIP_COLOURS = [
  "#E9C766", "#5FA3A8", "#C9493C", "#9DBE7E", "#E0915A", "#B9B2D6", "#D98BA6", "#7FA6D8", "#C7B37A", "#8FC9B0",
  "#E3A1C8", "#A3C25B", "#D7735F", "#6FB3C9", "#E6D08A", "#B48DC9", "#9AA9B8", "#E2B07A", "#7FBF8E", "#CE8F8F",
  "#A7B6E8", "#D4C26A", "#8CC0C0", "#E08C6E", "#B9C98F",
];
export const shipColour = (number: number) => SHIP_COLOURS[(Math.max(1, number) - 1) % SHIP_COLOURS.length]!;

const racing = (t: PublicTeam) => t.status === "active" || t.status === "finished";

/** The round the race is deciding: the first one still open (the last one once all are closed). */
export function liveRound(pub: PublicState) {
  return pub.rounds.find((r) => !r.closed) ?? pub.rounds.at(-1) ?? null;
}

export type Header = { kicker: string; title: string; line: string; seals: { filled: number; total: number } | null };

export function header(pub: PublicState): Header {
  const r = liveRound(pub);
  if (pub.status === "SETUP" || pub.status === "REGISTRATION" || pub.status === "READY" || !r) {
    const aboard = pub.teams.filter((t) => t.status !== "disqualified" && t.members > 0).length;
    return {
      kicker: "CRYPTO HUNT",
      title: "Crews gather",
      line: `${word(aboard)} crew${aboard === 1 ? "" : "s"} aboard`,
      seals: null,
    };
  }
  const advance = Math.max(0, r.advance);
  return {
    kicker: pub.status === "PAUSED" ? "CRYPTO HUNT · PAUSED" : "CRYPTO HUNT · LIVE",
    title: r.is_final ? "The final round" : `Round ${roman(r.number)}`,
    line: r.is_final
      ? `${word(advance)} crew${advance === 1 ? " claims" : "s claim"} the treasure`
      : `${word(advance)} crew${advance === 1 ? " advances" : "s advance"}`,
    seals: { filled: Math.min(r.completed, advance), total: advance },
  };
}

/** What a crew is doing, in a few words (ScreenLive mockup). `now` drives the penalty countdown. */
export function phaseText(t: PublicTeam, now: number): string {
  if (t.status === "finished") {
    const o = ordinal(t.final_rank ?? 0);
    return t.final_rank ? `Treasure · ${o.n}${o.suffix}` : "Treasure claimed";
  }
  if (t.status === "forming" || t.status === "locked") return `Aboard ${t.members}/4`;
  if (t.status === "eliminated") return t.eliminated_in_round ? `out in ${roman(t.eliminated_in_round)}` : "out";
  const r = t.round ? roman(t.round) : "";
  switch (t.phase) {
    case "SOLVING":
      return `Round ${r} · solving`;
    case "SEEKING":
      return "Seeking the mark";
    case "CHECKING_IN":
      return `Checking in ${t.checked_in}/${t.members}`;
    case "PENALTY":
      return t.penalty_until ? `Penalty ${mmss(Date.parse(t.penalty_until) - now)}` : "Penalty";
    case "COMPLETED":
      return `Round ${r} sealed`;
    default:
      return r ? `Round ${r}` : "Ready";
  }
}

export type Row =
  | { kind: "crew"; id: string; rank: string; name: string; pips: number; total: number; team: PublicTeam; top: boolean }
  | { kind: "more"; id: string; name: string; phase: string }
  | { kind: "out"; id: string; name: string; phase: string };

/**
 * Leaderboard rows: racing crews in standing order (the server sorts them, D-014), then the crews knocked out,
 * grouped by round, newest first (at most two groups). The board is 700 px tall: full rows (80 px, 48 px names) for
 * as many crews as fit and slim rows (58 px) below, as in the mockup; beyond that the tail folds into "+N more crews"
 * so the text never shrinks.
 */
export function rows(pub: PublicState, height = 700): Row[] {
  const live = liveRound(pub)?.number ?? 0;
  const started = !["SETUP", "REGISTRATION", "READY"].includes(pub.status);
  const ranked = pub.teams.filter((t) => racing(t) || t.status === "forming" || t.status === "locked");
  const outByRound = new Map<number, string[]>();
  for (const t of pub.teams) {
    if (t.status !== "eliminated") continue;
    const k = t.eliminated_in_round ?? 0;
    outByRound.set(k, [...(outByRound.get(k) ?? []), t.name]);
  }
  const out: Row[] = [...outByRound.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([round, names]) => ({
      kind: "out",
      id: `out-${round}`,
      name: names.length > 2 ? `${names.slice(0, 2).join(" · ")} +${names.length - 2}` : names.join(" · "),
      phase: round ? `out in ${roman(round)}` : "out",
    }));
  const GAP = 12;
  const room = Math.max(1, Math.floor((height + GAP - out.length * (58 + GAP)) / (80 + GAP)));
  const crew = (t: PublicTeam, i: number): Row => ({
    kind: "crew",
    id: t.id,
    rank: racing(t) ? roman(i + 1) : "",
    name: t.name,
    pips: t.rounds_completed,
    total: pub.total_rounds,
    team: t,
    top: t.status === "finished" || (t.status === "active" && (t.round ?? 0) > live),
  });
  const shown =
    ranked.length <= room
      ? ranked.map(crew)
      : [
          ...ranked.slice(0, room - 1).map(crew),
          {
            kind: "more" as const,
            id: "more",
            name: `+${ranked.length - room + 1} more crews`,
            phase: started && live ? `racing in Round ${roman(live)}` : "aboard",
          },
        ];
  return [...shown, ...out];
}

export type Ship = { id: string; name: string; colour: string; x: number; y: number; docked: boolean; sealed: boolean };

/**
 * One ship per racing crew (T-702). A ship sits at the region of the last round its crew completed that is now
 * closed (the server sends it, D-045), so the screen never points at a mark someone is still seeking; until then it
 * waits in the harbour along the bottom of the map. Ships that land on top of each other are nudged apart.
 */
export function ships(pub: PublicState): Ship[] {
  const crews = pub.teams.filter((t) => racing(t) || t.status === "locked");
  const docked = crews.filter((t) => !t.ship);
  const list = crews.map((t) => {
    const d = docked.indexOf(t);
    const pos = t.ship ?? {
      x: docked.length === 1 ? 0.5 : 0.08 + (0.84 * d) / Math.max(1, docked.length - 1),
      y: d % 2 ? 0.9 : 0.97,
    };
    const live = liveRound(pub)?.number ?? 0;
    return {
      id: t.id,
      name: t.name,
      colour: shipColour(t.number),
      x: pos.x,
      y: pos.y,
      docked: !t.ship,
      sealed: t.status === "finished" || (t.status === "active" && (t.round ?? 0) > live),
    };
  });
  for (let i = 0; i < list.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = list[j]!;
      const b = list[i]!;
      if (!b.docked && Math.abs(a.x - b.x) < 0.04 && Math.abs(a.y - b.y) < 0.06) b.x = Math.min(0.97, a.x + 0.05);
    }
  }
  return list;
}

export type Splash =
  | { kind: "round"; round: number; advanced: string[]; out: string[] }
  | { kind: "out"; names: string[] }
  | { kind: "finish"; id: string; name: string; rank: number }
  | { kind: "over" };

/**
 * The splashes a change in the public state calls for (T-703): a round closing (who advanced, who is out), crews
 * knocked out outside a round close, each finish (the finale plays, T-704) and the end of the game (D-040).
 */
export function splashes(prev: PublicState | null, next: PublicState): Splash[] {
  if (!prev) return [];
  const out: Splash[] = [];
  const before = new Map(prev.teams.map((t) => [t.id, t]));
  const covered = new Set<string>();
  for (const r of next.rounds) {
    const was = prev.rounds.find((p) => p.number === r.number);
    if (!r.closed || !was || was.closed || r.is_final) continue;
    const gone = next.teams.filter((t) => t.status === "eliminated" && t.eliminated_in_round === r.number);
    gone.forEach((t) => covered.add(t.id));
    out.push({
      kind: "round",
      round: r.number,
      advanced: next.teams.filter((t) => racing(t) && t.rounds_completed >= r.number).map((t) => t.name),
      out: gone.map((t) => t.name),
    });
  }
  const late = next.teams.filter(
    (t) => t.status === "eliminated" && before.get(t.id)?.status === "active" && !covered.has(t.id),
  );
  if (late.length) out.push({ kind: "out", names: late.map((t) => t.name) });
  for (const t of next.teams) {
    if (t.status === "finished" && before.get(t.id)?.status !== "finished" && t.final_rank) {
      out.push({ kind: "finish", id: t.id, name: t.name, rank: t.final_rank });
    }
  }
  // The game ending outranks whatever closed with it: the Game over splash tells it all.
  if (next.status === "FINISHED" && prev.status !== "FINISHED") return [...out.filter((s) => s.kind === "finish"), { kind: "over" }];
  return out;
}

/** The universal QR (D-021) stays up while round 1 is open: full screen for the first minutes, then in a corner. */
export function universalQr(pub: PublicState, now: number, fullFor = 3 * 60_000): "full" | "corner" | null {
  if (!pub.universal_token || (pub.status !== "RUNNING" && pub.status !== "PAUSED")) return null;
  if (pub.rounds[0]?.closed) return null;
  const started = pub.started_at ? Date.parse(pub.started_at) : now;
  return now - started < fullFor ? "full" : "corner";
}

/** The podium (top 3 finished crews in rank order), with the time each took. */
export function podium(pub: PublicState) {
  return pub.teams
    .filter((t) => t.status === "finished" && t.final_rank && t.final_rank <= 3)
    .sort((a, b) => a.final_rank! - b.final_rank!)
    .map((t) => ({ rank: t.final_rank!, id: t.id, name: t.name, time: t.finish_ms != null ? hms(t.finish_ms) : "", crew: t.crew ?? [] }));
}

export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** The LATEST ticker: the newest few happenings, in words. */
export function ticker(latest: PublicEvent[] | undefined, count = 3): string {
  const say = (e: PublicEvent): string | null => {
    const r = e.round ? roman(e.round) : "";
    switch (e.kind) {
      case "round_completed":
        return e.team ? `${e.team} sealed Round ${r}` : null;
      case "clue_complete":
        return e.team ? `${e.team} lifted the fog` : null;
      case "penalty_started":
        return e.team && e.ms ? `${e.team} serving a ${mmss(e.ms)} penalty` : null;
      case "eliminated":
        return e.team ? `${e.team} out in Round ${r}` : null;
      case "finished": {
        const o = ordinal(e.rank ?? 0);
        return e.team ? `${e.team} claimed the treasure · ${o.n}${o.suffix}` : null;
      }
      case "round_closed":
        return `Round ${r} is closed`;
      case "game_started":
        return "The hunt has begun";
      case "game_ended":
        return "The hunt is over";
      default:
        return null;
    }
  };
  return (latest ?? [])
    .map(say)
    .filter((s): s is string => !!s)
    .slice(0, count)
    .join(" · ");
}
