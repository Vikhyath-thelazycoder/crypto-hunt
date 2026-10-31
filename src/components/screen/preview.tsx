"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FinaleScreen } from "./FinaleScreen";
import { LiveScreen } from "./LiveScreen";
import { SplashCard, StartSplash } from "./Splash";
import { Stage } from "./Stage";
import { finalePub, screenPub } from "./fixtures";

const LATE = "https://crypto-hunt.example/q/Uv3n1v3rsalT0k3nAbCdEfGh";
const JOIN = "https://crypto-hunt.example/play";

// Development only (/dev/screens?s=screen-…): every projector view with the mockups' sample data.
const VIEWS: Record<string, () => ReactNode> = {
  "screen-live": () => <LiveScreen pub={screenPub()} />,
  "screen-sketch": () => <LiveScreen pub={{ ...screenPub(), map: null }} />,
  "screen-paused": () => <LiveScreen pub={{ ...screenPub(), status: "PAUSED", paused: true }} />,
  "screen-gather": () => {
    const p = screenPub();
    return (
      <LiveScreen
        pub={{
          ...p,
          status: "REGISTRATION",
          started_at: null,
          latest: [],
          rounds: p.rounds.map((r) => ({ ...r, closed: false, completed: 0 })),
          teams: p.teams.map((t, i) => ({ ...t, status: "locked", round: null, phase: null, ship: null, rounds_completed: 0, members: 4 - (i % 3) })),
        }}
       
        joinUrl={JOIN}
      />
    );
  },
  "screen-start": () => (
    <>
      <LiveScreen pub={screenPub()} />
      <StartSplash url={LATE} />
    </>
  ),
  "screen-round": () => (
    <>
      <LiveScreen pub={screenPub()} />
      <SplashCard
        splash={{ kind: "round", round: 3, advanced: ["Salt Wolves", "Black Tide", "Iron Gulls", "Night Herons", "Copper Owls", "Rust Anchors"], out: ["Ember Crows", "Grey Moths"] }}
        pub={screenPub()}
      />
    </>
  ),
  "screen-first": () => <FinaleScreen pub={finalePub(false)} replay="c3" />,
  "screen-finale": () => <FinaleScreen pub={finalePub()} replay="over" />,
  "screen-over": () => (
    <>
      <FinaleScreen pub={finalePub()} replay="over" />
      <SplashCard splash={{ kind: "over" }} pub={finalePub()} />
    </>
  ),
};



export function ProjectorPreview({ name }: { name: string }) {
  // Rendered in the browser only: sample timers would differ between server and browser.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <Stage>{(VIEWS[name] ?? VIEWS["screen-live"]!)()}</Stage>;
}
