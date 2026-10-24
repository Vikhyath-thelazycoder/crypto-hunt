"use client";

import type { ReactNode } from "react";
import { Shell } from "@/components/player/PlayerApp";
import { CheckInScreen } from "@/components/player/screens/CheckIn";
import { EliminatedScreen, SpectatorScreen, VictoryScreen } from "@/components/player/screens/Endings";
import { JoinScreen } from "@/components/player/screens/Join";
import { LobbyScreen } from "@/components/player/screens/Lobby";
import { PenaltyScreen } from "@/components/player/screens/Penalty";
import { PrankScreen, SealedScreen } from "@/components/player/screens/Results";
import { SeekScreen } from "@/components/player/screens/Seek";
import { SolveScreen } from "@/components/player/screens/Solve";
import { base, final, members, pub, seeking, solvedPieces } from "@/components/player/fixtures";
import type { MyStatus } from "@/lib/player/types";

const noop = () => {};
const SCREENS: Record<string, { s?: MyStatus; el: (s: MyStatus) => ReactNode }> = {
  join: { el: () => <JoinScreen reason={null} onJoined={noop} /> },
  lobby: {
    s: {
      ...base,
      game: { ...base.game, status: "REGISTRATION", broadcast: null },
      round: null,
      phase: null,
      members: members(0, 0).slice(0, 3),
    },
    el: (s) => <LobbyScreen s={s} />,
  },
  solve: { s: base, el: (s) => <SolveScreen s={s} onChanged={noop} onScanStart={noop} say={noop} /> },
  "solve-mcq": {
    s: {
      ...base,
      task: {
        ...base.task!,
        format: "mcq",
        text: "Which planet has the most moons?",
        options: ["Jupiter", "Saturn", "Uranus", "Neptune"],
        has_hint: false,
        category: "Science",
      },
    },
    el: (s) => <SolveScreen s={s} onChanged={noop} onScanStart={noop} say={noop} />,
  },
  seek: { s: seeking, el: (s) => <SeekScreen s={s} onScan={noop} /> },
  checkin: {
    s: {
      ...seeking,
      phase: "CHECKING_IN",
      members: members(3, 4).map((m) => (m.me ? { ...m, checked_in: false } : { ...m, checked_in: true })),
    },
    el: (s) => (
      <CheckInScreen
        s={s}
        mark={{ token: "t", label: "R3-04" }}
        scanning={false}
        onToken={noop}
        onMarkLost={noop}
        onChanged={noop}
        onBack={noop}
        say={noop}
      />
    ),
  },
  final: {
    s: {
      ...final,
      phase: "CHECKING_IN",
      members: members(2, 4).map((m) => ({ ...m, checked_in: m.name === "Ana" || m.name === "Meera" })),
    },
    el: (s) => (
      <CheckInScreen
        s={s}
        mark={{ token: "t", label: "F-01" }}
        scanning={false}
        onToken={noop}
        onMarkLost={noop}
        onChanged={noop}
        onBack={noop}
        say={noop}
      />
    ),
  },
  penalty: {
    s: {
      ...seeking,
      phase: "PENALTY",
      members: members(4, 4),
      penalty: { ms: 240000, until: new Date(Date.now() + 102000).toISOString() },
    },
    el: (s) => <PenaltyScreen s={s} onChanged={noop} paused={false} />,
  },
  prank: {
    s: base,
    el: (s) => <PrankScreen s={{ ...s, pieces: solvedPieces }} fakeKey="NICE·TRY" onBack={noop} />,
  },
  sealed: {
    s: { ...base, round: { number: 1, total: 7, is_final: false, difficulty: 1 } },
    el: (s) => <SealedScreen s={s} onBack={noop} onRescan={noop} />,
  },
  eliminated: {
    s: {
      ...base,
      team: { ...base.team, status: "eliminated", eliminated_in_round: 4 },
      round: { number: 4, total: 7, is_final: false, difficulty: 3 },
    },
    el: (s) => <EliminatedScreen s={s} pub={pub} onChoose={noop} />,
  },
  spectator: {
    s: { ...base, team: { ...base.team, status: "eliminated" } },
    el: (s) => <SpectatorScreen s={s} pub={pub} onLeave={noop} />,
  },
  victory: {
    s: { ...base, team: { ...base.team, status: "finished", final_rank: 1, completion_key: "7QX4MDKP2" } },
    el: (s) => <VictoryScreen s={s} />,
  },
};

export function ScreenPreview({ name }: { name: string }) {
  const entry = SCREENS[name] ?? SCREENS.solve!;
  const s = entry.s ?? base;
  return <Shell s={entry.s}>{entry.el(s)}</Shell>;
}
