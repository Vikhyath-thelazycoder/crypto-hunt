// Alerts and ship's-log entries in plain words for the captain (F13). Pure: unit-tested in admin.test.ts.
import { mmss, ordinal, roman } from "@/lib/player/format";
import type { LogEntry, SnapAlert, SnapRound } from "./types";

export type Tone = "wax" | "gold" | "sea";
export type AlertView = { title: string; body: string; tone: Tone };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rn = (v: unknown) => {
  const n = num(v);
  return n === null ? "?" : roman(n);
};

function who(team: string | null, player: string | null) {
  if (team && player) return `${team} · ${player}`;
  return team ?? player ?? "A player";
}

function at(qr: string | null, place: string | null) {
  if (!qr) return "a mark";
  return place ? `${qr} (${place})` : qr;
}

export function describeAlert(a: Pick<SnapAlert, "kind" | "data" | "team" | "player" | "place">): AlertView {
  const d = a.data ?? {};
  const w = who(a.team, a.player);
  const qr = at(str(d.qr), a.place);
  const path = d.own_future === true ? "their own future mark" : "not on their path";
  switch (a.kind) {
    case "wrong_team": {
      const owners = Array.isArray(d.owners) ? d.owners.filter((o): o is string => typeof o === "string") : [];
      const whose = d.spare === true ? "a spare" : owners.length ? `${owners.join(", ")}’s mark` : "an unused mark";
      return { tone: "wax", title: "Wrong crew's mark", body: `${w} scanned ${qr}, ${whose}.` };
    }
    case "locked_scan":
      return {
        tone: "wax",
        title: "Later-round scan",
        body: `${w} scanned ${qr} of Round ${rn(d.qr_round)} while in Round ${rn(d.team_round)}: ${path}. Sealed, nothing given.`,
      };
    case "locked_key":
      return {
        tone: "wax",
        title: "Key for a later-round mark",
        body: `${w} typed the key of ${qr} (Round ${rn(d.qr_round)}) while in Round ${rn(d.team_round)}: ${path}. Refused.`,
      };
    case "possible_sweep":
      return {
        tone: "wax",
        title: "Possible sweep",
        body: `${a.team ?? "A crew"} has scanned ${num(d.count) ?? 3} later-round marks in Round ${rn(d.round)}.`,
      };
    case "prank":
      return { tone: "gold", title: "Fell for a prank", body: `${w} scanned decoy ${qr}.` };
    case "left_site": {
      const secs = Math.round((num(d.away_ms) ?? 0) / 1000);
      return { tone: "wax", title: "Left the site mid-question", body: `${w} was away ${secs} s.` };
    }
    case "session_moved":
      return {
        tone: "sea",
        title: "Phone changed",
        body: `${w} joined again on another phone; the old one was signed out.`,
      };
    case "bad_qr":
      return { tone: "wax", title: "Unknown codes", body: `${w} scanned 3 codes that aren't Crypto Hunt marks.` };
    case "key_spam":
      return { tone: "wax", title: "Key spam", body: `${w} typed keys too fast and was slowed down.` };
    case "bad_keys":
      return {
        tone: "wax",
        title: "Wrong keys",
        body: `${w} typed ${num(d.count) ?? 5} wrong keys at ${qr}.`,
      };
    case "foreign_seal":
      return {
        tone: "wax",
        title: "Another crew's seal code",
        body: `${w} typed ${str(d.code_of_team) ?? "another crew"}’s seal code at the final mark.`,
      };
    case "answer_spam":
      return { tone: "wax", title: "Answer spam", body: `${w} hit the answer limit (10 a minute).` };
    case "kicked":
      return {
        tone: "sea",
        title: "Player removed",
        body: `${str(d.name) ?? "A player"} was removed from ${a.team ?? "their crew"}.`,
      };
    default:
      return { tone: "wax", title: a.kind.replace(/_/g, " "), body: w };
  }
}

/** Plural labels for the "Open alerts" card summary. */
const KIND_LABEL: Record<string, [string, string]> = {
  wrong_team: ["wrong-mark scan", "wrong-mark scans"],
  locked_scan: ["later-round scan", "later-round scans"],
  locked_key: ["later-round key", "later-round keys"],
  possible_sweep: ["possible sweep", "possible sweeps"],
  prank: ["prank", "pranks"],
  left_site: ["left site", "left site"],
  session_moved: ["phone change", "phone changes"],
  bad_qr: ["unknown code", "unknown codes"],
  key_spam: ["key spam", "key spam"],
  bad_keys: ["wrong-key alert", "wrong-key alerts"],
  foreign_seal: ["foreign seal code", "foreign seal codes"],
  answer_spam: ["answer spam", "answer spam"],
  kicked: ["removal", "removals"],
  stuck: ["stuck crew", "stuck crews"],
};

export function kindSummary(byKind: Record<string, number>, top = 2): string {
  return Object.entries(byKind)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([k, n]) => {
      const [one, many] = KIND_LABEL[k] ?? [k.replace(/_/g, " "), k.replace(/_/g, " ")];
      return `${n} ${n === 1 ? one : many}`;
    })
    .join(" · ");
}

const place = (e: Pick<LogEntry, "data" | "place">) =>
  str(e.data?.qr) ? ` ${at(str(e.data.qr), e.place)}` : "";
const withReason = (text: string, reason: string | null) => (reason ? `${text} · reason: ${reason}` : text);

/** One ship's-log line, or null for entries that would only add noise. */
export function describeLog(e: LogEntry, rounds: Pick<SnapRound, "number" | "advance">[] = []): string | null {
  const d = e.data ?? {};
  const w = who(e.team, e.player);
  const crew = e.team ?? "A crew";
  if (e.src === "audit") return describeAudit(e);
  switch (e.kind) {
    case "joined":
      return `${w} joined (${num(d.members) ?? "?"}/4)`;
    case "game_started":
      return "The hunt began";
    case "paused":
      return "Captain paused the hunt";
    case "resumed":
      return "The hunt resumed";
    case "game_ended":
      return withReason("The hunt ended", str(d.reason));
    case "opened_round_one":
      return `${w} opened their first question`;
    case "scanned":
      return `${w} scanned${place(e)}`;
    case "found_early":
      return `${w} found${place(e)} early, still solving`;
    case "checked_in":
      return `${w} sealed check-in at${place(e)}`;
    case "solved":
      return `${w} solved piece ${num(d.piece) === null ? "?" : roman(num(d.piece)! + 1)}`;
    case "wrong_penalty":
      return `${w} missed three times · +${mmss(num(d.added_ms) ?? 0)}, penalty now ${mmss(num(d.penalty_ms) ?? 0)}`;
    case "crew_named":
      return `${w} named the crew ${str(d.name) ?? crew}`;
    case "hint":
      return `${w} took a hint · penalty now ${mmss(num(d.penalty_ms) ?? 0)}`;
    case "clue_complete":
      return `${crew} unlocked all four pieces · fog lifted`;
    case "penalty_started":
      return `${crew} all sealed · penalty ${mmss(num(d.ms) ?? 0)} started`;
    case "round_completed": {
      const r = num(d.round);
      const x = rounds.find((y) => y.number === r)?.advance;
      const order = num(d.order) ?? 0;
      return `${crew} sealed Round ${rn(r)} · ${x ? `${order} of ${x}` : `${order}${ordinal(order).suffix}`}`;
    }
    case "eliminated":
      return `${crew} eliminated in Round ${rn(d.round)}`;
    case "finished": {
      const rank = num(d.rank) ?? 0;
      return `${crew} claimed ${rank}${ordinal(rank).suffix} place`;
    }
    case "round_closed":
      return `Round ${rn(d.round)} sealed · crews still in it are out`;
    case "round_started":
      return null;
    default:
      return `${w} · ${e.kind.replace(/_/g, " ")}`;
  }
}

function describeAudit(e: LogEntry): string | null {
  const d = e.data ?? {};
  const crew = e.team ?? "a crew";
  const text = (() => {
    switch (e.kind) {
      case "create_teams":
        return `Captain created ${num(d.count) ?? "?"} crews`;
      case "rename_team":
        return `Captain renamed a crew to ${str(d.name) ?? "?"}`;
      case "delete_team":
        return `Captain removed ${crew}`;
      case "set_registration":
        return d.open === true ? "Captain opened joining" : "Captain closed joining";
      case "apply_game_plan":
        return `Captain generated the course · ${num(d.rounds) ?? "?"} rounds, ${num(d.qrs) ?? "?"} marks, ${num(d.pranks) ?? 0} decoys`;
      case "broadcast":
        return str(d.text) ? `Captain broadcast: “${str(d.text)}”` : "Captain cleared the broadcast";
      case "set_hints":
        return d.enabled === true ? "Captain turned hints on" : "Captain turned hints off";
      case "set_mcq_lockout":
        return `Captain set the multiple-choice lockout to ${mmss(num(d.ms) ?? 0)}`;
      case "set_advance_count":
        return `Captain set Round ${rn(e.target === null ? null : Number(e.target))} advance to ${num(d.x) ?? "?"}`;
      case "move_team":
        return `Captain moved ${crew} to Round ${rn(d.round)}`;
      case "set_member_inactive":
        return `Captain marked ${e.player ?? "a player"} (${crew}) ${d.inactive === true ? "inactive" : "active again"}`;
      case "repoint_team":
        return `Captain re-pointed ${crew} to another mark`;
      case "kick_player":
        return `Captain removed ${str(d.name) ?? "a player"} from the crew`;
      case "disqualify_team":
        return `Captain disqualified ${crew}`;
      case "force_complete":
        return `Captain completed ${crew}'s round by hand`;
      case "start_new_game":
        return d.regenerate_qr === true
          ? "Captain started a new game with new QR codes"
          : "Captain started a new game";
      // Covered by their own events (game_started, paused, resumed, game_ended).
      case "start_game":
      case "pause_game":
      case "resume_game":
      case "end_game":
        return null;
      default:
        return `Captain · ${e.kind.replace(/_/g, " ")}`;
    }
  })();
  return text === null ? null : withReason(text, e.reason);
}
