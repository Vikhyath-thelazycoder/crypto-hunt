"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import * as api from "@/lib/admin/api";
import {
  courseChecks,
  courseFromDb,
  placeInputs,
  sparesOf,
  type Course,
  type CourseLocation,
  type CourseRound,
} from "@/lib/admin/course";
import { started } from "@/lib/admin/dashboard";
import type { CourseQr, Snapshot } from "@/lib/admin/types";
import { defaultAdvance, PRANK_SHARE, pyramidCounts } from "@/lib/engine";
import { generatePlan, GeneratorError, type Plan } from "@/lib/generator";
import { roman } from "@/lib/player/format";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  AdminHeader,
  AdminPage,
  attempt,
  CheckIcon,
  ConfirmDialog,
  Trouble,
  Unrolling,
  useToast,
  WarnIcon,
  type Say,
} from "./parts";
import { Pyramid } from "./Pyramid";

type Data = {
  snap: Snapshot;
  locations: CourseLocation[];
  course: Course | null;
};

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** /admin/generator (Generator.dc.html, T-404, F10): one click builds the course; the server re-validates it. */
export function Generator() {
  const { say, toast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase();
    try {
      const [snap, locs, rounds, qrs, links, assigns] = await Promise.all([
        api.adminSnapshot(),
        supabase.from("locations").select("id, name, area, map_x, map_y, clue_sets(pieces)").order("created_at"),
        supabase.from("rounds").select("number, qr_count, advance_count, difficulty").order("number"),
        supabase.from("qr_codes").select("id, label, round, kind, is_spare, location_id"),
        supabase.from("qr_links").select("from_qr, to_qr"),
        supabase.from("assignments").select("team_id, round, qr_id"),
      ]);
      setData({
        snap,
        locations: api.check(locs) as Data["locations"],
        course: courseFromDb(
          api.check(rounds) as CourseRound[],
          api.check(qrs) as CourseQr[],
          api.check(links) as { from_qr: string; to_qr: string }[],
          api.check(assigns) as { team_id: string; round: number; qr_id: string }[],
        ),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof api.AdminError ? e.code : "SERVER");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const fixed = data ? started(data.snap.game) : false;
  const header = (
    <AdminHeader
      right={
        data && (
          <span className="rounded-[20px] px-3.5 py-1.5 font-display text-[15px] tracking-[.1em] text-[#F3E6C8] shadow-[inset_0_0_0_1px_rgba(226,190,114,.45)]">
            {fixed ? "COURSE FIXED · HUNT STARTED" : "BEFORE THE HUNT"}
          </span>
        )
      }
    />
  );
  if (error) return <AdminPage header={header}><Trouble code={error} onRetry={load} /></AdminPage>;
  if (!data) return <AdminPage header={header}><Unrolling /></AdminPage>;
  return (
    <AdminPage header={header}>
      <GeneratorBody key={data.course ? "applied" : "none"} data={data} say={say} reload={load} />
      {toast}
    </AdminPage>
  );
}

type Settings = { counts: string[]; advance: string[]; prank: string };

function defaults(teams: number, course: Course | null): Settings {
  if (course) {
    const marks = course.qrs.filter((q) => q.kind !== "prank").length;
    const pranks = course.qrs.length - marks;
    return {
      counts: course.rounds.map((r) => String(r.qr_count)),
      advance: course.rounds.map((r) => String(r.advance_count)),
      prank: String(Math.round((pranks / Math.max(1, marks)) * 100)),
    };
  }
  const n = Math.max(1, teams);
  const counts = pyramidCounts(n);
  return {
    counts: counts.map(String),
    advance: defaultAdvance(n, counts.length).map(String),
    prank: String(Math.round(PRANK_SHARE * 100)),
  };
}

const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

function GeneratorBody({ data, say, reload }: { data: Data; say: Say; reload: () => Promise<void> }) {
  const { snap, locations, course } = data;
  const teams = snap.teams;
  const teamIds = useMemo(() => teams.map((t) => t.id), [teams]);
  const teamNames = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const fixed = started(snap.game);
  const [settings, setSettings] = useState<Settings>(() => defaults(teams.length, course));
  // A New Game (or crews added or removed) changes what the course is built for: start again from the current crews,
  // never the previous game's numbers.
  const courseKey = course ? "course" : "none";
  useEffect(() => {
    setSettings(defaults(teams.length, course));
    setMode(course ? "applied" : "draft");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the crew count or course presence changes
  }, [teams.length, courseKey]);
  const [seed, setSeed] = useState(newSeed);
  const [mode, setMode] = useState<"applied" | "draft">(course ? "applied" : "draft");
  const [pathTeam, setPathTeam] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const ids = { teams: useId(), prank: useId(), path: useId() };

  const edit = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setMode("draft");
  };

  // The plan Generate would send, from the settings (draft), or the course already applied.
  const draft = useMemo((): { plan: Plan | null; error: string | null } => {
    const counts = settings.counts.map(int);
    const advance = settings.advance.map(int);
    const prank = int(settings.prank);
    const bad = counts.findIndex((c) => Number.isNaN(c));
    if (bad >= 0) return { plan: null, error: `Round ${roman(bad + 1)} marks must be a whole number.` };
    const badX = advance.findIndex((c) => Number.isNaN(c));
    if (badX >= 0) return { plan: null, error: `Round ${roman(badX + 1)} advance must be a whole number.` };
    if (Number.isNaN(prank) || prank > 100) return { plan: null, error: "Decoys % must be a whole number from 0 to 100." };
    try {
      const plan = generatePlan({
        teamIds,
        ...placeInputs(locations),
        seed,
        counts,
        advance,
        prankShare: prank / 100,
      });
      return { plan, error: null };
    } catch (e) {
      return { plan: null, error: e instanceof GeneratorError ? e.message : "This course can't be built." };
    }
  }, [settings, seed, teamIds, locations]);

  const showing: Plan | null = mode === "applied" && course ? course : draft.plan;
  const spares = mode === "applied" && course ? course.spares : showing ? sparesOf(showing) : [];
  const shownPath = pathTeam ?? showing?.assignments.find((a) => a.round === 1)?.team_id ?? null;

  const checks = courseChecks({
    plan: showing,
    planError: mode === "draft" ? draft.error : null,
    teams: teams.map((t) => ({ id: t.id, name: t.name, status: t.status, members: t.members.length })),
    locations,
    questionsByDifficulty: snap.questions.by_difficulty,
  });
  // The applied view's Generate builds a fresh course on click, so only a draft's own problems block it.
  const blocked =
    fixed || teams.length === 0 || (mode === "draft" && (!draft.plan || checks.some((c) => c.level === "error")));

  const generate = async () => {
    // Applied view: build a fresh course from the same settings. Draft view: send exactly what is shown.
    let plan = draft.plan;
    if (mode === "applied") {
      try {
        plan = generatePlan({
          teamIds,
          ...placeInputs(locations),
          seed: newSeed(),
          counts: settings.counts.map(int),
          advance: settings.advance.map(int),
          prankShare: int(settings.prank) / 100,
        });
      } catch (e) {
        say(e instanceof GeneratorError ? e.message : "This course can't be built.", "wax");
        return false;
      }
    }
    if (!plan) return false;
    setBusy(true);
    let made = 0;
    const ok = await attempt(async () => {
      made = (await api.applyGamePlan(plan!)).new_cards;
    }, say);
    setBusy(false);
    // D-033: cards belong to places, so only places new to the venue need printing; the master list always changes.
    if (ok)
      say(
        made
          ? `Course set. ${made} place${made === 1 ? " is" : "s are"} new: print the QR sheet for ${made === 1 ? "its card" : "their cards"}, then the master list.`
          : "Course set. Every place keeps its printed card: reprint only the master list.",
        "moss",
      );
    if (ok) {
      await reload();
      setMode("applied");
      setPathTeam(null);
    }
    return ok;
  };

  const rounds = showing?.rounds.length ?? settings.counts.length;
  const marks = showing ? showing.qrs.filter((q) => q.kind !== "prank").length : 0;
  const pranks = showing ? showing.qrs.length - marks : 0;
  const decoys = showing ? showing.qrs.filter((q) => q.kind === "prank").map((q) => q.ref) : [];

  return (
    <div className="flex flex-wrap items-start gap-[22px] px-7 pt-[26px] pb-8">
      <section className="ch-asheet min-w-0 p-5" aria-label="Settings" style={{ flex: "1 1 280px" }}>
        <h2 className="m-0 font-display text-2xl font-normal">Set the course</h2>
        <p className="mt-1 mb-4 text-sm text-[#5E3D20]">
          {fixed ? "The hunt has started: the course is fixed." : "Defaults come from your crews. Change any number, then generate."}
        </p>
        {!fixed && teams.length > (int(settings.counts[0] ?? "") || Infinity) && (
          <p className="-mt-2 mb-4 text-sm text-[#5E3D20]">
            More crews than round-I marks: crews share a round-I mark, spread evenly (at most{" "}
            {Math.ceil(teams.length / int(settings.counts[0]!))} per mark). Each crew still gets its own clue there.
          </p>
        )}
        <fieldset disabled={fixed} className="m-0 border-0 p-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={ids.teams} className="ch-lbl">
                CREWS
              </label>
              <input id={ids.teams} className="ch-num mt-1.5" value={teams.length} readOnly title="From the Crews page" />
            </div>
            <div>
              <label htmlFor={ids.prank} className="ch-lbl">
                DECOYS %
              </label>
              <input
                id={ids.prank}
                className="ch-num mt-1.5"
                inputMode="numeric"
                value={settings.prank}
                aria-invalid={Number.isNaN(int(settings.prank)) || int(settings.prank) > 100}
                onChange={(e) => edit({ prank: e.target.value.replace(/\D/g, "").slice(0, 3) })}
              />
            </div>
          </div>
          <div className="mt-[18px] grid items-center gap-x-2.5 gap-y-2" style={{ gridTemplateColumns: "54px minmax(0,1fr) minmax(0,1fr)" }}>
            <span className="ch-lbl">RND</span>
            <span className="ch-lbl">MARKS</span>
            <span className="ch-lbl">ADVANCE</span>
            {settings.counts.map((c, i) => {
              const last = i === settings.counts.length - 1;
              return (
                <Row key={i} i={i} last={last} count={c} adv={settings.advance[i] ?? ""} edit={edit} settings={settings} />
              );
            })}
          </div>
          <div className="mt-2.5 flex gap-3 text-sm">
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[#8E1B1B] underline disabled:opacity-40"
              disabled={settings.counts.length >= 12}
              onClick={() => {
                const counts = [...settings.counts];
                const advance = [...settings.advance];
                counts.splice(counts.length - 1, 0, String(Math.max(2, int(counts[counts.length - 2] ?? "2") - 1)));
                advance.splice(advance.length - 1, 0, advance[advance.length - 2] ?? advance[advance.length - 1] ?? "3");
                edit({ counts, advance });
              }}
            >
              + round
            </button>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[#8E1B1B] underline disabled:opacity-40"
              disabled={settings.counts.length <= 2}
              onClick={() => {
                const counts = [...settings.counts];
                const advance = [...settings.advance];
                counts.splice(counts.length - 2, 1);
                advance.splice(advance.length - 2, 1);
                edit({ counts, advance });
              }}
            >
              − round
            </button>
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[#5E3D20] underline"
              onClick={() => {
                setSettings(defaults(teams.length, null));
                setMode("draft");
              }}
            >
              defaults
            </button>
          </div>
        </fieldset>
        <p className="mt-3.5 mb-0 text-[13px] text-[#5E3D20]">
          Several marks can lead to the same mark in the next round. Advance can be changed live during the hunt.
        </p>
      </section>

      <section className="ch-asheet min-w-0 px-[22px] py-5" aria-label="The pyramid" style={{ flex: "999 1 560px" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-display text-[28px] font-normal">
            The pyramid
            <span className="ml-3 align-middle font-body text-sm text-[#5E3D20]">
              {mode === "applied" ? "current course" : course ? "preview · not applied" : "preview"}
            </span>
          </h2>
          {showing && (
            <div className="font-mono text-sm font-semibold text-[#5E3D20]">
              {rounds} ROUNDS · {marks} MARKS · {pranks} DECOYS · 1 START = {marks + pranks + 1} SPOTS
            </div>
          )}
        </div>
        {showing ? (
          <Pyramid plan={showing} spares={spares} teamNames={teamNames} pathTeam={shownPath} onPickTeam={setPathTeam} />
        ) : (
          <div role="alert" className="mt-4 rounded-xl bg-[rgba(142,27,27,.08)] px-5 py-10 text-center text-[15px] text-[#4A2F18] shadow-[inset_0_0_0_1px_rgba(142,27,27,.35)]">
            {draft.error ?? "Create crews to build a course."}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-[22px] gap-y-3 text-sm text-[#4A2F18]">
          <span className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="-11 -11 22 22" aria-hidden="true">
              <rect x="-9" y="-9" width="18" height="18" rx="3" fill="#FFFBEF" stroke="#2A1D12" strokeWidth="1.4" />
            </svg>
            Assigned mark
          </span>
          <span className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="-11 -11 22 22" aria-hidden="true">
              <rect x="-9" y="-9" width="18" height="18" rx="3" fill="none" stroke="#6E4A2A" strokeWidth="1.4" strokeDasharray="3 2.5" />
            </svg>
            Spare ({spares.length}) — re-point a crew here if a mark is damaged
          </span>
          {showing && showing.assignments.length > 0 && (
            <label htmlFor={ids.path} className="flex items-center gap-2">
              <svg width="26" height="8" aria-hidden="true">
                <path d="M0 4 H26" stroke="#8E1B1B" strokeWidth="3" />
              </svg>
              Path of
              <select
                id={ids.path}
                className="ch-inp w-auto py-1"
                value={shownPath ?? ""}
                onChange={(e) => setPathTeam(e.target.value)}
              >
                {teams
                  .filter((t) => showing.assignments.some((a) => a.team_id === t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {mode === "applied" && course && course.assignments.length === 0 && (
            <span>Routes are drawn at Start (new random route per crew).</span>
          )}
          {mode === "draft" && !fixed && (
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-[#8E1B1B] underline"
              onClick={() => setSeed(newSeed())}
            >
              Shuffle routes
            </button>
          )}
          {mode === "draft" && course && (
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-[#5E3D20] underline"
              onClick={() => {
                setSettings(defaults(teams.length, course));
                setMode("applied");
              }}
            >
              Back to the current course
            </button>
          )}
        </div>
        {showing && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[rgba(110,74,42,.25)] pt-3.5">
            <span className="ch-lbl mr-1">DECOYS</span>
            {decoys.length === 0 && <span className="text-sm text-[#5E3D20]">none</span>}
            {decoys.map((d) => (
              <span key={d} className="ch-decoy">
                {d}
              </span>
            ))}
            <span className="flex-1" />
            <span className="ch-decoy text-[#F7E9C8] shadow-none" style={{ background: "#2F5D62", color: "#F7E9C8" }}>
              START · universal
            </span>
          </div>
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-4" style={{ flex: "1 1 300px" }}>
        <section className="ch-asheet px-5 pt-[18px] pb-2.5" aria-label="Checks">
          <h2 className="m-0 mb-2 font-display text-2xl font-normal">Checks</h2>
          {checks.map((c, i) => (
            <div key={i} className="ch-ok">
              {c.level === "ok" ? <CheckIcon /> : <WarnIcon color={c.level === "error" ? "#8E1B1B" : "#B88A1E"} />}
              <span>
                {c.text}
                {c.link && (
                  <>
                    {" "}
                    <a href={c.link.href} className="font-semibold">
                      {c.link.label}
                    </a>
                  </>
                )}
              </span>
            </div>
          ))}
        </section>
        <button
          type="button"
          className="ch-awax h-[70px] rounded-2xl text-[26px]"
          disabled={blocked || busy}
          onClick={() => (course ? setConfirm(true) : void generate())}
        >
          {busy ? "Charting…" : "Generate game"}
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <PrintLink href="/admin/print?sheet=qr" disabled={!course}>
            Print QR sheet
          </PrintLink>
          <PrintLink href="/admin/print?sheet=master" disabled={!course}>
            Master list
          </PrintLink>
        </div>
        <p className="m-0 text-sm leading-[1.45] text-[#BFA77F]">
          You can generate again as many times as you like until you press Start. After that the course is fixed.
          {course && " Generating again shuffles the rounds but keeps every place's card: reprint only the master list."}
        </p>
      </aside>
      {confirm && (
        <ConfirmDialog
          title="Replace the current course?"
          body={
            <>
              A new pyramid over the same places: each place keeps its printed card, but its round can change.{" "}
              <b>Reprint the master list</b>; only places new to the course need a card printed.
            </>
          }
          confirmLabel="Generate a new course"
          onConfirm={generate}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function Row({
  i,
  last,
  count,
  adv,
  edit,
  settings,
}: {
  i: number;
  last: boolean;
  count: string;
  adv: string;
  edit: (p: Partial<Settings>) => void;
  settings: Settings;
}) {
  const set = (key: "counts" | "advance", v: string) => {
    const next = [...settings[key]];
    next[i] = v.replace(/\D/g, "").slice(0, 3);
    edit({ [key]: next });
  };
  return (
    <>
      <span className="font-display text-lg" style={last ? { color: "#8E1B1B" } : undefined}>
        {roman(i + 1)}
      </span>
      <input
        className="ch-num"
        inputMode="numeric"
        aria-label={last ? "Final round marks" : `Round ${i + 1} marks`}
        value={count}
        aria-invalid={Number.isNaN(int(count))}
        onChange={(e) => set("counts", e.target.value)}
      />
      <input
        className="ch-num"
        inputMode="numeric"
        aria-label={last ? "Final round advance" : `Round ${i + 1} advance`}
        value={adv}
        aria-invalid={Number.isNaN(int(adv))}
        onChange={(e) => set("advance", e.target.value)}
      />
    </>
  );
}

function PrintLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled)
    return (
      <button type="button" className="ch-brass h-[50px] rounded-xl text-base" disabled title="Generate the course first">
        {children}
      </button>
    );
  return (
    <a href={href} target="_blank" rel="noopener" className="ch-brass flex h-[50px] items-center justify-center rounded-xl text-base no-underline">
      {children}
    </a>
  );
}
