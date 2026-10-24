import type { MyStatus } from "./types";

// Which player screen to show (docs/design/screens). The server state decides; local UI only adds the
// short-lived results of a scan (prank, sealed mark) and the check-in camera.

export type Overlay =
  { kind: "prank"; fakeKey: string; round: number } | { kind: "sealed"; round: number } | null;

export type Screen =
  | "lobby"
  | "solve"
  | "seek"
  | "checkin"
  | "final"
  | "penalty"
  | "prank"
  | "sealed"
  | "eliminated"
  | "spectator"
  | "game_over"
  | "victory"
  | "hunt_over";

export function screenFor(s: MyStatus, overlay: Overlay, checkinOpen: boolean): Screen {
  const team = s.team.status;
  if (team === "finished") return "victory";
  if (team === "eliminated" || team === "disqualified") {
    if (s.team.eliminated_view === "spectator") return "spectator";
    if (s.team.eliminated_view === "game_over") return "game_over";
    return "eliminated";
  }
  const game = s.game.status;
  if (game === "SETUP" || game === "REGISTRATION" || game === "READY" || !s.round || !s.phase) {
    return game === "FINISHED" ? "hunt_over" : "lobby";
  }
  if (game === "FINISHED") return "hunt_over";
  if (overlay?.kind === "prank") return "prank";
  if (overlay?.kind === "sealed") return "sealed";
  const atMark = s.phase === "CHECKING_IN" || (s.phase === "SEEKING" && checkinOpen);
  if (atMark) return s.round.is_final ? "final" : "checkin";
  if (s.phase === "SEEKING") return "seek";
  if (s.phase === "PENALTY") return "penalty";
  return "solve";
}
