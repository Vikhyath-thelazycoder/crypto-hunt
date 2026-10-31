"use client";

import { ChestStage } from "@/components/three/ChestStage";
import { roman } from "@/lib/player/format";
import type { PublicState } from "@/lib/player/types";
import { podium } from "@/lib/screen/board";

const TITLES = ["The treasure is found", "Second to the treasure", "Third to the treasure"];

/**
 * The finale (ScreenFinale mockup, T-704): the Blender chest opens under god rays above a podium for the top 3. It
 * plays after each finish (`replay` changes, so the chest opens again), and stays once the game is over, when the
 * kicker tells everyone to come back to the venue (D-040).
 */
export function FinaleScreen({ pub, replay }: { pub: PublicState; replay: string }) {
  const top = podium(pub);
  const over = pub.status === "FINISHED";
  const title = over ? "The treasure is claimed" : (TITLES[(top.at(-1)?.rank ?? 1) - 1] ?? TITLES[0]!);
  const at = (rank: number) => top.find((p) => p.rank === rank) ?? null;

  return (
    <main
      className="relative h-[1080px] w-[1920px] overflow-hidden text-[#F3E6C8]"
      style={{
        fontFamily: "var(--font-body)",
        background: "radial-gradient(1100px 760px at 50% 38%, #4E3618 0%, #24180C 45%, #0E0905 80%, #080503 100%)",
      }}
    >
      <div aria-hidden="true" className="sc-rays absolute" style={{ left: "50%", top: 380, width: 2600, height: 2600, margin: "-1300px 0 0 -1300px" }} />
      <div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          left: 610,
          top: 200,
          width: 700,
          height: 420,
          background: "radial-gradient(closest-side, rgba(255,214,120,.5), rgba(255,170,60,.16) 60%, transparent)",
        }}
      />

      <header className="absolute right-0 left-0 text-center" style={{ top: 50 }}>
        <div className="font-display text-[32px] tracking-[.4em]" style={{ color: over ? "#F0A08A" : "#E2BE72" }}>
          {over ? "GAME OVER · COME BACK TO THE VENUE" : "CRYPTO HUNT"}
        </div>
        <h1
          className="m-0 mt-1 font-display text-[104px] leading-none font-normal text-[#FBE7B0]"
          style={{ textShadow: "0 0 50px rgba(255,180,80,.45), 0 4px 0 rgba(0,0,0,.6)" }}
        >
          {title}
        </h1>
      </header>

      <div
        key={replay}
        role="img"
        aria-label="The open treasure chest, glowing with gold"
        className="absolute"
        style={{ left: 600, top: 170, width: 720, height: 500, maskImage: "radial-gradient(closest-side, #000 75%, transparent)" }}
      >
        <ChestStage />
      </div>

      <section aria-label="Podium" className="absolute right-0 bottom-0 left-0 flex items-end justify-center">
        <Pedestal place={at(2)} rank={2} width={480} height={230} over={over} />
        <Pedestal place={at(1)} rank={1} width={560} height={270} over={over} />
        <Pedestal place={at(3)} rank={3} width={480} height={190} over={over} />
      </section>
    </main>
  );
}

const MEDALS = {
  1: "radial-gradient(circle at 34% 28%, #FFF4C4, #EBC35A 38%, #A9781C 76%, #5E420C)",
  2: "radial-gradient(circle at 34% 28%, #FFFFFF, #CFCFC8 40%, #8A8A82 80%, #55554F)",
  3: "radial-gradient(circle at 34% 28%, #FFD9B0, #C98A4E 40%, #8A4E1E 80%, #4E2A0C)",
} as const;

function Pedestal({
  place,
  rank,
  width,
  height,
  over,
}: {
  over: boolean;
  place: ReturnType<typeof podium>[number] | null;
  rank: 1 | 2 | 3;
  width: number;
  height: number;
}) {
  const first = rank === 1;
  const medal = first ? 124 : 96;
  return (
    <div className="sc-ped" style={{ width, zIndex: first ? 3 : undefined }} data-testid={`podium-${rank}`}>
      <div
        className="sc-medal relative z-[2]"
        style={{ width: medal, height: medal, fontSize: first ? 58 : 44, marginBottom: first ? -8 : -6, background: MEDALS[rank], opacity: place ? 1 : 0.35 }}
      >
        {roman(rank)}
      </div>
      <div
        className="sc-ped-top"
        style={first ? { background: "linear-gradient(180deg,#6E4A22,#A87A3E 60%,#D6A862)" } : undefined}
      />
      <div
        className="sc-ped-front"
        style={{
          height,
          ...(first ? { background: "linear-gradient(180deg,#7E5028 0%,#53321A 55%,#2E1A0B 100%)" } : {}),
        }}
      >
        {place ? (
          <>
            <div
              className="font-display leading-none"
              style={{
                fontSize: first ? 72 : 56,
                color: first ? "#FFF0C4" : "#FBF0D2",
                textShadow: first ? "0 0 30px rgba(255,190,80,.45)" : undefined,
              }}
            >
              {place.name}
            </div>
            {first && place.crew.length > 0 && <div className="mt-2 text-[26px] text-[#E8D6B0]">{place.crew.join(" · ")}</div>}
            {place.time && (
              <div className="mt-2.5 font-mono" style={{ fontSize: first ? 32 : 30, color: first ? "#F3DFA8" : "#D9C39A" }}>
                {place.time}
              </div>
            )}
          </>
        ) : (
          <div className="font-display text-[44px] leading-none text-[#D9C39A] opacity-50">{over ? "Unclaimed" : "Still racing"}</div>
        )}
      </div>
    </div>
  );
}
