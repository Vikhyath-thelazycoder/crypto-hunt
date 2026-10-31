"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { AdminError, check } from "@/lib/admin/api";
import { adminMessage } from "@/lib/admin/messages";
import { placeLine, type PlaceDetails } from "@/lib/admin/place";
import { roman } from "@/lib/player/format";
import { markUrl, siteOrigin } from "@/lib/site";
import { getBrowserSupabase } from "@/lib/supabase/client";

export type Sheet = "qr" | "master" | "codes";

type Card = {
  id: string;
  label: string;
  kind: "universal" | "target" | "final" | "prank";
  round: number | null;
  is_spare: boolean;
  key: string;
  token: string;
  place: PlaceDetails | null;
  crews: string[];
  qr: string;
};
type Crew = { id: string; number: number; name: string; code: string };

const KIND_ORDER = { universal: 0, target: 1, final: 2, prank: 3 } as const;

export { markUrl } from "@/lib/site";

const qrImage = (text: string) =>
  QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 1, width: 640, color: { dark: "#000000", light: "#ffffff" } });

/**
 * /admin/print (T-405, F12, SECURITY.md T17: admin only). `qr`: two marks per A4, each card with a cut-off placement
 * stub; `master`: the admin's list of every mark and key; `codes`: crew code slips.
 */
export function PrintSheet({ sheet }: { sheet: Sheet }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [crews, setCrews] = useState<(Crew & { qr: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    // Printed codes send phones to the live site even when printed from a laptop (NEXT_PUBLIC_SITE_URL).
    const here = siteOrigin();
    setOrigin(here);
    const supabase = getBrowserSupabase();
    void (async () => {
      try {
        if (sheet === "codes") {
          const teams = check(await supabase.from("teams").select("id, number, name, code").order("number")) as Crew[];
          const join = await qrImage(`${here}/play`);
          setCrews(teams.map((t) => ({ ...t, qr: join })));
          return;
        }
        const [qrs, assigns] = await Promise.all([
          supabase.from("qr_codes").select("id, label, kind, round, is_spare, key, token, locations(name, notes, place_no, building, floor, landmark)"),
          supabase.from("assignments").select("qr_id, round, clue_set, teams(name, number)"),
        ]);
        // T-507: each crew on a mark with the clue set drawn for it.
        const crewsBy = new Map<string, { name: string; number: number }[]>();
        for (const a of check(assigns) as unknown as {
          qr_id: string;
          clue_set: number | null;
          teams: { name: string; number: number } | null;
        }[]) {
          if (a.teams)
            crewsBy.set(a.qr_id, [
              ...(crewsBy.get(a.qr_id) ?? []),
              { number: a.teams.number, name: a.clue_set ? `Crew ${a.teams.number} (riddle ${a.clue_set})` : `Crew ${a.teams.number}` },
            ]);
        }
        const rows = check(qrs) as unknown as (Omit<Card, "place" | "crews" | "qr"> & {
          locations: PlaceDetails | null;
        })[];
        const sorted = rows.filter((r) => r.kind === "target" || r.kind === "final").sort(
          (a, b) =>
            KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
            (a.round ?? 0) - (b.round ?? 0) ||
            a.label.localeCompare(b.label, undefined, { numeric: true }),
        );
        const out: Card[] = [];
        for (const r of sorted) {
          out.push({
            id: r.id,
            label: r.label,
            kind: r.kind,
            round: r.round,
            is_spare: r.is_spare,
            key: r.key,
            token: r.token,
            place: r.locations ?? null,
            crews: (crewsBy.get(r.id) ?? []).sort((x, y) => x.number - y.number).map((c) => c.name),
            qr: sheet === "qr" ? await qrImage(markUrl(here, r.token)) : "",
          });
        }
        setCards(out);
      } catch (e) {
        setError(e instanceof AdminError ? e.code : "SERVER");
      }
    })();
  }, [sheet]);

  if (error)
    return (
      <p role="alert" className="ch-print-screen p-8 text-lg">
        {adminMessage(error)}
      </p>
    );
  if ((sheet === "codes" && !crews) || (sheet !== "codes" && !cards))
    return <p role="status" className="ch-print-screen p-8 font-display text-xl tracking-[.2em]">Inking the sheet…</p>;

  if (sheet === "codes") return <CodeSlips crews={crews!} origin={origin} />;
  if (sheet === "master") return <MasterList cards={cards!} />;
  return <QrSheet cards={cards!} />;
}

function Toolbar({ title, note }: { title: string; note: string }) {
  return (
    <div className="ch-print-toolbar">
      <div>
        <b>{title}</b> · {note}
      </div>
      <button type="button" className="ch-brass h-10 rounded-[10px] px-4 text-[15px]" onClick={() => window.print()}>
        Print
      </button>
    </div>
  );
}

const kindLabel = (c: Pick<Card, "kind" | "round" | "is_spare">) =>
  c.kind === "final" ? `FINAL · Round ${roman(c.round ?? 1)}` : `Round ${roman(c.round ?? 1)}${c.is_spare ? " · spare" : ""}`;

/** One card per A4. The card part is identical for every kind, so a decoy can't be told from a real mark. */
function QrSheet({ cards }: { cards: Card[] }) {
  if (!cards.length) return <Empty />;
  return (
    <div className="ch-print">
      <Toolbar
        title="QR sheet"
        note={`${cards.length} cards, one on each A4 page. Cut off each placement stub before hiding the card.`}
      />
      {cards.map((c, p) => (
        <section key={p} className="ch-print-page" aria-label={`Page ${p + 1}`}>
          {[c].map((c) => (
            <article key={c.id} className="ch-print-half" data-testid="qr-card" data-label={c.label}>
              <div className="ch-print-card">
                <div className="ch-print-brand">CRYPTO HUNT</div>
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI made on this page */}
                <img src={c.qr} alt="" className="ch-print-qr" />
                <div className="ch-print-scan">Scan in the Crypto Hunt site, or type this code there</div>
                <div className="ch-print-keylabel">CODE</div>
                <div className="ch-print-key">{c.key}</div>
              </div>
              {/* D-043: everything about where the card goes is on this strip, which is cut off and thrown away. */}
              <div className="ch-print-stub" data-testid="qr-stub">
                <span className="ch-print-scissors" aria-hidden="true">
                  ✂
                </span>
                <div>
                  <div className="ch-print-where">
                    {c.kind === "universal" ? "Start card" : c.place ? placeLine(c.place) : "No place set"}
                  </div>
                  {c.kind === "universal"
                    ? "Not hidden: shown on the projector at the start."
                    : c.place?.notes
                      ? `Hide it here: ${c.place.notes}`
                      : `Hide it anywhere in ${c.place?.name ?? "this place"} (no exact spot needed)`}
                  {c.kind !== "universal" && c.place?.landmark && (
                    <>
                      <br />
                      Landmark: {c.place.landmark}
                    </>
                  )}
                  <br />
                  Mark <b>{c.label}</b> · {kindLabel(c)}
                  <br />
                  <i>Cut this strip off and throw it away before hiding the card.</i>
                </div>
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

/** The admin's master list: every mark exactly once, with its key and the crews whose route uses it. */
function MasterList({ cards }: { cards: Card[] }) {
  if (!cards.length) return <Empty />;
  return (
    <div className="ch-print ch-print-flow">
      <Toolbar title="Master list" note={`${cards.length} marks. Keep this sheet with the captain: it holds every key.`} />
      <h1 className="ch-print-h1">Crypto Hunt · master list</h1>
      <table className="ch-print-table">
        <thead>
          <tr>
            <th>Mark</th>
            <th>Kind</th>
            <th>Place</th>
            <th>Hide it here</th>
            <th>Landmark</th>
            <th>Key</th>
            <th>Crews on this mark</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id} data-testid="master-row">
              <td className="font-mono font-semibold">{c.label}</td>
              <td>{kindLabel(c)}</td>
              <td>{c.place ? placeLine(c.place) : "—"}</td>
              <td>{c.place?.notes ?? ""}</td>
              <td>{c.place?.landmark ?? ""}</td>
              <td className="font-mono font-semibold tracking-[.08em]">{c.key}</td>
              <td>{c.crews.join(", ") || (c.kind === "target" || c.kind === "final" ? "drawn at Start" : "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Crew code slips: eight per A4, to hand each crew its code. */
function CodeSlips({ crews, origin }: { crews: (Crew & { qr: string })[]; origin: string }) {
  if (!crews.length) return <Empty text="No crews yet. Create them on the Crews page." />;
  return (
    <div className="ch-print">
      <Toolbar title="Crew code slips" note={`${crews.length} crews, 8 per A4 page.`} />
      {Array.from({ length: Math.ceil(crews.length / 8) }, (_, p) => (
        <section key={p} className="ch-print-page ch-print-slips" aria-label={`Page ${p + 1}`}>
          {crews.slice(p * 8, p * 8 + 8).map((c) => (
            <article key={c.id} className="ch-print-slip">
              <div>
                <div className="ch-print-brand">CRYPTO HUNT · CREW {String(c.number).padStart(2, "0")}</div>
                <div className="ch-print-crew">{c.name}</div>
                <div className="ch-print-keylabel">TEAM CODE</div>
                <div className="ch-print-code">{c.code}</div>
                <div className="ch-print-scan">Join at {origin.replace(/^https?:\/\//, "")}/play · four hands per crew</div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI made on this page */}
              <img src={c.qr} alt={`QR code for ${origin}/play`} className="ch-print-slipqr" />
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function Empty({ text = "No course yet. Generate the game first." }: { text?: string }) {
  return (
    <p role="status" className="ch-print-screen p-8 text-lg">
      {text}
    </p>
  );
}
