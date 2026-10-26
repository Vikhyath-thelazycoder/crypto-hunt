"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useFocusGuard } from "@/hooks/useFocusGuard";
import { usePlayer } from "@/hooks/usePlayer";
import { PlayerError, scanQr, setEliminatedView } from "@/lib/player/api";
import { initials, roman } from "@/lib/player/format";
import { messageFor } from "@/lib/player/messages";
import { screenFor, type Overlay, type Screen } from "@/lib/player/screen";
import type { MyStatus } from "@/lib/player/types";
import { CaptainNote, Toast } from "./parts";
import { RoundTransition } from "./RoundTransition";
import { Scanner } from "./Scanner";
import { CheckInScreen, type Mark } from "./screens/CheckIn";
import {
  EliminatedScreen,
  GameOverNotice,
  GameOverScreen,
  HuntOverScreen,
  SpectatorScreen,
  VictoryScreen,
} from "./screens/Endings";
import { JoinScreen } from "./screens/Join";
import { LobbyScreen } from "./screens/Lobby";
import { PenaltyScreen } from "./screens/Penalty";
import { PrankScreen, SealedScreen } from "./screens/Results";
import { SeekScreen } from "./screens/Seek";
import { SolveScreen } from "./screens/Solve";

type Say = { text: string; tone: "ink" | "wax" | "moss"; id: number };

/** /play: one phone, one player (P3). Server state picks the screen; scans add short-lived results. */
export function PlayerApp() {
  const { state, pub, refresh } = usePlayer();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mark, setMark] = useState<Mark | null>(null);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<Say | null>(null);

  const say = useCallback(
    (text: string, tone: Say["tone"] = "ink") => setToast({ text, tone, id: Date.now() }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const s = state.kind === "ready" || state.kind === "offline" ? state.status : null;
  const round = s?.round?.number ?? null;
  const phase = s?.phase ?? null;

  // A new round clears the previous mark. Scanning moves SEEKING → CHECKING_IN, which must keep it.
  useEffect(() => {
    setMark(null);
  }, [round]);
  // Leaving the mark's phases (penalty, next round, elimination) closes the camera.
  useEffect(() => {
    if (phase !== "SEEKING" && phase !== "CHECKING_IN") setCheckinOpen(false);
  }, [phase]);

  const onToken = useCallback(
    async (token: string) => {
      setScanning(true);
      try {
        const r = await scanQr(token);
        if (r.ok && r.result === "QUESTION") {
          setSheetOpen(false);
          say("Your question is open. Good hunting.", "moss");
        } else if (r.ok && r.result === "PRANK") {
          setSheetOpen(false);
          setCheckinOpen(false);
          setOverlay({ kind: "prank", fakeKey: r.fake_key, round: r.round });
        } else if (r.ok && (r.result === "ASK_KEY" || r.result === "ASK_KEY_AND_SEAL")) {
          setSheetOpen(false);
          setMark({ token, label: r.qr });
          setCheckinOpen(true);
        } else if (!r.ok && r.code === "LOCKED_MARK") {
          setSheetOpen(false);
          setCheckinOpen(false);
          setOverlay({ kind: "sealed", round: r.round ?? 1 });
        } else if (!r.ok) {
          say(messageFor(r.code), r.code === "SOLVE_FIRST" ? "ink" : "wax");
        }
      } catch (e) {
        say(messageFor(e instanceof PlayerError ? e.code : "SERVER"), "wax");
      } finally {
        setScanning(false);
        void refresh();
      }
    },
    [refresh, say],
  );

  // Development only: end-to-end tests hand a scanned token to the same handler as the camera
  // (scripts/e2e-play.mts). Not present in production builds.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __chScan?: (token: string) => Promise<void> };
    w.__chScan = onToken;
    return () => {
      delete w.__chScan;
    };
  }, [onToken]);

  const screen = s ? screenFor(s, overlay, checkinOpen) : null;
  const guarded = screen === "solve" && s?.task?.opened && !s.task.solved ? s.task.id : null;
  const focus = useFocusGuard(guarded);
  const paused = s?.game.status === "PAUSED";

  // Captain's broadcasts reach every phone once (the Lobby shows it in place).
  const [seenBroadcast, setSeenBroadcast] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSeenBroadcast(localStorage.getItem("ch-broadcast-seen"));
    } catch {
      setSeenBroadcast(null);
    }
  }, []);
  const showBroadcast =
    !!s?.game.broadcast &&
    !!s.game.broadcast_at &&
    s.game.broadcast_at !== seenBroadcast &&
    screen !== "lobby";
  // Game over (D-040): every phone gets the pop-up once per finished hunt.
  const [seenOver, setSeenOver] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSeenOver(localStorage.getItem("ch-gameover-seen"));
    } catch {
      setSeenOver(null);
    }
  }, []);
  const overAt = s?.game.status === "FINISHED" ? (pub?.finished_at ?? "finished") : null;
  const showOver = !!overAt && overAt !== seenOver;
  const dismissOver = () => {
    setSeenOver(overAt);
    try {
      if (overAt) localStorage.setItem("ch-gameover-seen", overAt);
    } catch {
      /* private mode */
    }
  };

  const dismissBroadcast = () => {
    const at = s?.game.broadcast_at ?? null;
    setSeenBroadcast(at);
    try {
      if (at) localStorage.setItem("ch-broadcast-seen", at);
    } catch {
      /* private mode */
    }
  };

  if (state.kind === "loading") {
    return (
      <Shell>
        <Centered>
          <p className="font-display text-xl tracking-[.2em] text-sepia-ink">Unrolling the map…</p>
        </Centered>
      </Shell>
    );
  }
  if (state.kind === "signed_out" || !s || !screen) {
    return (
      <Shell>
        <JoinScreen reason={state.kind === "signed_out" ? state.reason : null} onJoined={refresh} />
      </Shell>
    );
  }

  const choose = async (view: "game_over" | "spectator") => {
    await setEliminatedView(view).catch(() => null);
    void refresh();
  };

  const body: Record<Exclude<Screen, "final">, ReactNode> = {
    lobby: <LobbyScreen s={s} onChanged={refresh} say={say} />,
    solve: <SolveScreen s={s} onChanged={refresh} onScanStart={() => setSheetOpen(true)} say={say} />,
    seek: <SeekScreen s={s} onScan={() => setCheckinOpen(true)} />,
    checkin: (
      <CheckInScreen
        s={s}
        mark={mark}
        scanning={scanning}
        onToken={onToken}
        onMarkLost={() => setMark(null)}
        onChanged={refresh}
        onBack={() => setCheckinOpen(false)}
        say={say}
      />
    ),
    penalty: <PenaltyScreen s={s} onChanged={refresh} paused={paused} />,
    prank: (
      <PrankScreen
        s={s}
        fakeKey={overlay?.kind === "prank" ? overlay.fakeKey : ""}
        onBack={() => setOverlay(null)}
      />
    ),
    sealed: (
      <SealedScreen
        s={s}
        onBack={() => setOverlay(null)}
        onRescan={() => {
          setOverlay(null);
          if (s.phase === "SEEKING" || s.phase === "CHECKING_IN") setCheckinOpen(true);
          else setSheetOpen(true);
        }}
      />
    ),
    eliminated: <EliminatedScreen s={s} pub={pub} onChoose={choose} />,
    spectator: <SpectatorScreen s={s} pub={pub} onLeave={() => choose("game_over")} />,
    game_over: <GameOverScreen s={s} onWatch={() => choose("spectator")} />,
    victory: <VictoryScreen s={s} />,
    hunt_over: <HuntOverScreen s={s} pub={pub} />,
  };
  // final mark uses the check-in screen in its final variant
  const content = screen === "final" ? body.checkin : body[screen];
  const ending = ["eliminated", "spectator", "game_over", "victory", "hunt_over"].includes(screen);

  return (
    <Shell s={s}>
      <div className={state.kind === "offline" ? "opacity-70" : undefined}>{content}</div>
      {state.kind === "offline" && (
        <div
          role="status"
          className="fixed top-3 right-3 z-40 rounded-full bg-[#2A1D12] px-3 py-1.5 font-display text-sm text-[#F7E9C8] shadow-lg"
        >
          Reconnecting…
        </div>
      )}
      {sheetOpen && (
        <ScanSheet onClose={() => setSheetOpen(false)}>
          <Scanner onToken={onToken} busy={scanning} height={320} />
        </ScanSheet>
      )}
      {showBroadcast && (
        <div className="fixed inset-x-0 top-3 z-40 mx-auto max-w-[440px] px-4">
          <div className="relative">
            <CaptainNote text={s.game.broadcast!} />
            <button
              type="button"
              className="absolute top-2 right-3 p-1 text-sepia-ink"
              aria-label="Dismiss message"
              onClick={dismissBroadcast}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {paused && !ending && (
        <Veil
          title="Paused"
          text="The captain has paused the hunt. Stay where you are; nothing counts until the hunt resumes."
        />
      )}
      {focus.warned && !paused && (
        <Veil
          title="You left the hunt"
          text="The captain has been told. Stay on this page while you answer: no searching, no second phones."
          action={{ label: "Back to my question", onClick: focus.dismiss }}
        />
      )}
      {!ending && <RoundTransition round={round} total={s.round?.total ?? null} />}
      {showOver && <GameOverNotice pub={pub} mine={s.team.id} onClose={dismissOver} />}
      {toast && <Toast key={toast.id} text={toast.text} tone={toast.tone} onClose={() => setToast(null)} />}
    </Shell>
  );
}

/**
 * Phones get the screen edge to edge. On a laptop the same screen sits in a centred column on the chart
 * table (DESIGN.md › Responsive rules, DesktopSealed.dc.html, T-309).
 */
export function Shell({ s, children }: { s?: MyStatus; children: ReactNode }) {
  return (
    <div className="ch-shell min-h-dvh sm:flex sm:flex-col">
      <header className="ch-leather hidden flex-wrap items-center gap-x-5 gap-y-3 px-7 py-3 sm:flex">
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="-20 -20 40 40" aria-hidden="true">
            <circle r="19" fill="#B88A1E" />
            <circle r="15" fill="#2A1A0F" />
            <path d="M0,-13 L3,0 L0,2 L-3,0Z" fill="#C9493C" />
            <path d="M0,13 L3,0 L0,-2 L-3,0Z" fill="#EADBB8" />
          </svg>
          <span className="font-display text-[22px] text-[#F3E6C8]">Crypto Hunt</span>
        </div>
        <div className="flex-1" />
        {s && (
          <div className="flex items-center gap-2.5">
            <div className="ch-seal" style={{ width: 34, height: 34, fontSize: 14 }}>
              {initials(s.team.name)}
            </div>
            <span className="font-display text-lg text-[#F3E6C8]">{s.team.name}</span>
            {s.round && (
              <span
                className="rounded-[14px] px-3 py-1 font-display text-[15px] tracking-[.1em] text-[#FBE3A0]"
                style={{ boxShadow: "inset 0 0 0 1px rgba(226,190,114,.4)" }}
              >
                ROUND {roman(s.round.number)} / {roman(s.round.total)}
              </span>
            )}
          </div>
        )}
      </header>
      <div className="sm:flex sm:flex-1 sm:justify-center sm:px-4 sm:pt-8 sm:pb-10">
        <div className="ch-shell-card flex min-h-dvh flex-col sm:min-h-[780px] sm:w-full sm:max-w-[440px] sm:overflow-hidden sm:rounded-[22px] [&>*]:flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="ch-paper flex min-h-dvh flex-1 items-center justify-center p-6 text-center">
      {children}
    </main>
  );
}

function ScanSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan a mark"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div className="ch-paper w-full max-w-[440px] rounded-t-[22px] p-4 sm:rounded-[22px]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 font-display text-2xl font-normal">Scan the mark</h2>
          <button type="button" className="ch-ghost h-10 rounded-[10px] px-4 text-[15px]" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
        <p className="mt-3 mb-0 text-center text-sm text-sepia-ink">Hold the QR inside the gold corners.</p>
      </div>
    </div>
  );
}

function Veil({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,10,6,.82)] p-6"
    >
      <div className="ch-sheet w-full max-w-[380px] rounded-2xl px-6 py-7 text-center text-ink">
        <p className="m-0 font-display text-[15px] tracking-[.3em] text-wax">{title.toUpperCase()}</p>
        <p className="mt-3 mb-0 text-lg leading-[1.4]">{text}</p>
        {action && (
          <button
            type="button"
            className="ch-wax mt-5 h-14 w-full rounded-[14px] text-xl"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
