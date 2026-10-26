"use client";

import { useEffect, useRef, useState } from "react";
import { useNow } from "@/hooks/useNow";
import { usePublicState } from "@/hooks/usePublicState";
import type { PublicState } from "@/lib/player/types";
import { splashes, universalQr, type Splash } from "@/lib/screen/board";
import { markUrl, siteOrigin } from "@/lib/site";
import { FinaleScreen } from "./FinaleScreen";
import { LiveScreen } from "./LiveScreen";
import { SplashCard, StartSplash } from "./Splash";
import { Stage } from "./Stage";

const SPLASH_MS = 9_000;
const OVER_MS = 14_000;
const FINALE_MS = 25_000;

type Queued = Exclude<Splash, { kind: "finish" }>;

/** /screen: the audience view (P7), signed out, reading the public state only. */
export function ScreenApp() {
  const { pub, online } = usePublicState();
  if (!pub) return <Stage>{null}</Stage>;
  return <Projector pub={pub} online={online} />;
}

/**
 * What the projector shows for a public state, and the splashes its changes call for (T-703): each round closing and
 * crews knocked out get a splash in turn; each finish plays the finale for 25 s (T-704); once the game is over the
 * finale stays, after the Game over splash (D-040).
 */
export function Projector({ pub, online = true }: { pub: PublicState; online?: boolean }) {
  const now = useNow(1000);
  const prev = useRef<PublicState | null>(null);
  const [queue, setQueue] = useState<{ s: Queued; until: number }[]>([]);
  const [finale, setFinale] = useState<{ id: string; until: number } | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(siteOrigin()), []);

  useEffect(() => {
    const found = splashes(prev.current, pub);
    prev.current = pub;
    if (!found.length) return;
    const t = Date.now();
    const finish = found.filter((s) => s.kind === "finish").at(-1);
    if (finish) setFinale({ id: finish.id, until: t + FINALE_MS });
    const rest = found.filter((s): s is Queued => s.kind !== "finish");
    if (rest.length) setQueue((q) => [...q, ...rest.map((s) => ({ s, until: 0 }))]);
  }, [pub]);

  // Start each splash's clock when it reaches the front, and drop it when its time is up.
  useEffect(() => {
    const head = queue[0];
    if (!head) return;
    if (!head.until) {
      setQueue(([h, ...rest]) => [{ ...h!, until: Date.now() + (h!.s.kind === "over" ? OVER_MS : SPLASH_MS) }, ...rest]);
    } else if (now >= head.until) {
      setQueue(([, ...rest]) => rest);
    }
  }, [queue, now]);

  const over = pub.status === "FINISHED";
  const showFinale = over || (finale !== null && now < finale.until);
  const qr = universalQr(pub, now);
  const qrUrl = pub.universal_token && origin ? markUrl(origin, pub.universal_token) : null;
  const head = queue[0]?.s;

  return (
    <Stage background={showFinale ? "#080503" : "#0B0805"}>
      {showFinale ? (
        <FinaleScreen pub={pub} replay={finale?.id ?? "over"} />
      ) : (
        <LiveScreen
          pub={pub}
          online={online}
          qr={qr === "corner" && qrUrl ? { url: qrUrl, mode: "corner" } : null}
          joinUrl={origin ? `${origin}/play` : undefined}
        />
      )}
      {!showFinale && !head && qr === "full" && qrUrl && <StartSplash url={qrUrl} />}
      {head && <SplashCard key={JSON.stringify(head)} splash={head} pub={pub} />}
    </Stage>
  );
}
