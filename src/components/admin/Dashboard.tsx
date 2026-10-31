"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAdminSnapshot } from "@/hooks/useAdminSnapshot";
import { useNow } from "@/hooks/useNow";
import * as api from "@/lib/admin/api";
import { cards, huntClock, hms, stamp, started, stats, type Card } from "@/lib/admin/dashboard";
import { describeAlert, describeLog, kindSummary } from "@/lib/admin/describe";
import type { Snapshot } from "@/lib/admin/types";
import { roman } from "@/lib/player/format";
import { ControlBar } from "./ControlBar";
import { AdminHeader, AdminPage, attempt, Trouble, Unrolling, useToast } from "./parts";
import { TeamDrawer } from "./TeamDrawer";

const SIGNED_OUT = new Set(["NOT_ADMIN", "NOT_AUTHENTICATED"]);

/** /admin · Live dashboard (AdminDashboard.dc.html, T-406, T-407). */
export function Dashboard() {
  const { state, offset, refresh } = useAdminSnapshot();
  const router = useRouter();
  const { say, toast } = useToast();
  const now = useNow(1000) + offset;

  useEffect(() => {
    if (state.kind === "error" && SIGNED_OUT.has(state.code)) router.replace("/admin/login");
  }, [state, router]);

  if (state.kind !== "ready") {
    return (
      <AdminPage header={<AdminHeader />}>
        {state.kind === "loading" ? <Unrolling /> : <Trouble code={state.code} onRetry={refresh} />}
      </AdminPage>
    );
  }
  const s = state.snap;
  return (
    <AdminPage
      header={
        <AdminHeader
          right={<StatusPill s={s} now={now} live={state.live} />}
          bar={<ControlBar s={s} say={say} onChanged={refresh} />}
        />
      }
    >
      <Board s={s} now={now} say={say} refresh={refresh} />
      {toast}
    </AdminPage>
  );
}

function StatusPill({ s, now, live }: { s: Snapshot; now: number; live: boolean }) {
  const g = s.game;
  const focus = stats(s).round;
  const total = s.rounds.length;
  const of = focus && total ? ` · ROUND ${roman(focus.number)} OF ${roman(total)}` : "";
  const label =
    g.status === "RUNNING"
      ? `LIVE${of}`
      : g.status === "PAUSED"
        ? `PAUSED${of}`
        : g.status === "FINISHED"
          ? "HUNT OVER"
          : g.status === "READY"
            ? "COURSE READY"
            : g.status === "REGISTRATION"
              ? g.registration_open
                ? "JOINING OPEN"
                : "JOINING CLOSED"
              : "BEFORE THE HUNT";
  const tone =
    g.status === "RUNNING"
      ? { bg: "rgba(75,107,58,.22)", ring: "rgba(125,160,102,.5)", dot: "#8CC06E", text: "#D6EBC6" }
      : g.status === "PAUSED"
        ? { bg: "rgba(184,138,30,.2)", ring: "rgba(226,190,114,.55)", dot: "#E9C766", text: "#FBE3A0" }
        : { bg: "transparent", ring: "rgba(226,190,114,.45)", dot: "", text: "#F3E6C8" };
  const clock = huntClock(g, now);
  return (
    <div className="flex items-center gap-3">
      {!live && (
        <span role="status" className="font-display text-sm tracking-[.1em] text-[#E9C2B6]">
          Reconnecting…
        </span>
      )}
      <div
        className="flex items-center gap-2.5 rounded-[20px] px-3.5 py-1.5"
        style={{ background: tone.bg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
      >
        {tone.dot && (
          <span className="h-[9px] w-[9px] rounded-full" style={{ background: tone.dot, boxShadow: `0 0 10px ${tone.dot}` }} />
        )}
        <span className="font-display text-base tracking-[.1em]" style={{ color: tone.text }}>
          {label}
        </span>
        {clock !== null && <span className="font-mono text-[13px] text-[#BFA77F]">{hms(clock)}</span>}
      </div>
    </div>
  );
}

function Board({
  s,
  now,
  say,
  refresh,
}: {
  s: Snapshot;
  now: number;
  say: ReturnType<typeof useToast>["say"];
  refresh: () => void;
}) {
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const list = useMemo(() => cards(s, now), [s, now]);
  const stuck = list.filter((c) => c.stuckMs > 0 && !hidden.has(stuckKey(c)));
  const team = s.teams.find((t) => t.id === openTeam);

  return (
    <>
      <Tiles s={s} stuck={stuck.length} />
      <div className="flex flex-wrap items-start gap-[22px] px-7 pt-[22px] pb-8">
        <section aria-label="Crews" className="min-w-0" style={{ flex: "999 1 560px" }}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="m-0 font-display text-2xl font-normal text-[#F3E6C8]">The crews</h2>
            <span className="text-sm text-[#BFA77F]">Sorted by progress · updates live</span>
          </div>
          {list.length === 0 ? (
            <div className="ch-tile px-5 py-6 text-[15px] text-[#EADBB8]">
              No crews yet. <Link href="/admin/crews">Create crews</Link> to hand out team codes.
            </div>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
              {list.map((c) => (
                <TeamCard key={c.team.id} c={c} onOpen={() => setOpenTeam(c.team.id)} />
              ))}
            </div>
          )}
        </section>
        <aside className="flex min-w-0 flex-col gap-[18px]" style={{ flex: "1 1 340px" }}>
          <AlertsRail
            s={s}
            stuck={stuck}
            onHideStuck={(c) => setHidden((h) => new Set(h).add(stuckKey(c)))}
            say={say}
            refresh={refresh}
          />
          <ShipsLog s={s} />
        </aside>
      </div>
      {team && <TeamDrawer s={s} team={team} say={say} onClose={() => setOpenTeam(null)} onChanged={refresh} />}
    </>
  );
}

const stuckKey = (c: Card) => `${c.team.id}:${c.team.phase_since}`;

function Tile({ label, big, of, sub, wax, children }: {
  label: string;
  big: React.ReactNode;
  of?: React.ReactNode;
  sub?: React.ReactNode;
  wax?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`${wax ? "ch-tile-wax" : "ch-tile"} px-[18px] py-3.5`}>
      <div className="font-display text-sm tracking-[.14em]" style={{ color: wax ? "#E9A99A" : "#BFA77F" }}>
        {label}
      </div>
      <div className="font-display text-[44px] leading-[1.05]" style={{ color: wax ? "#FFD9CC" : "#F3E6C8" }}>
        {big}
        {of !== undefined && <span className="text-[26px] text-[#BFA77F]"> / {of}</span>}
      </div>
      {sub && (
        <div className="text-sm" style={{ color: wax ? "#E9C2B6" : "#BFA77F" }}>
          {sub}
        </div>
      )}
      {children}
    </div>
  );
}

function Tiles({ s, stuck }: { s: Snapshot; stuck: number }) {
  const st = stats(s);
  const open = s.open_alerts + stuck;
  const summary = kindSummary({ ...s.open_by_kind, ...(stuck ? { stuck } : {}) });
  const alerts = <Tile label="OPEN ALERTS" big={open} sub={summary || "All quiet"} wax={open > 0} />;
  if (!started(s.game)) {
    const need = 4 * s.rounds.length;
    return (
      <section aria-label="Before the hunt" className="grid gap-3.5 px-7 pt-[22px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        <Tile label="CREWS SEALED" big={st.locked} of={st.total} sub={`${st.joined} players joined`} />
        <Tile
          label="THE COURSE"
          big={s.rounds.length ? s.course.marks : "—"}
          sub={
            s.rounds.length ? (
              `${s.rounds.length} rounds · ${s.course.spares} spares`
            ) : (
              <>
                Not generated yet · <Link href="/admin/generator">Generator</Link>
              </>
            )
          }
        />
        {alerts}
        <Tile
          label="QUESTIONS READY"
          big={s.questions.enabled}
          sub={need ? `${need} needed to start (4 per round)` : "4 per round needed"}
        />
      </section>
    );
  }
  const r = st.round;
  const segments = r ? Math.min(r.advance, 12) : 0;
  const lit = r ? Math.round((Math.min(r.completed, r.advance) / Math.max(1, r.advance)) * segments) : 0;
  return (
    <section aria-label="Round status" className="grid gap-3.5 px-7 pt-[22px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
      <Tile
        label={r ? `ROUND ${roman(r.number)} SEALED` : "ROUND"}
        big={<span className="text-[#FBE3A0]">{r?.completed ?? 0}</span>}
        of={r?.advance ?? 0}
      >
        <div className="mt-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, segments)}, minmax(0, 1fr))` }}>
          {Array.from({ length: segments }, (_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-[3px]"
              style={{ background: i < lit ? "linear-gradient(90deg,#E9C766,#B88A1E)" : "rgba(226,190,114,.2)" }}
            />
          ))}
        </div>
      </Tile>
      <Tile
        label="CREWS RACING"
        big={st.racing}
        of={st.total}
        sub={`${st.fallen} out · ${st.playersLive} players live`}
      />
      {alerts}
    </section>
  );
}

function TeamCard({ c, onOpen }: { c: Card; onOpen: () => void }) {
  return (
    <article className="ch-card" data-out={c.out || undefined} data-lead={c.lead || undefined}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${c.team.name}: open crew`}
        className="absolute inset-0 cursor-pointer rounded-xl border-0 bg-transparent p-0"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-xl leading-[1.1]">{c.team.name}</div>
          <div className="font-mono text-xs opacity-80">{c.code}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-[11px] tracking-[.16em] opacity-75">ROUND</div>
          <div className="font-display text-[28px] leading-[.9]">{c.round}</div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="ch-chip" data-tone={c.chip.tone}>
          {c.chip.label}
        </span>
        <span className={`truncate font-mono text-xs ${c.stuckMs ? "font-semibold text-[#8E1B1B]" : "opacity-80"}`}>
          {c.meta}
        </span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {c.members.map((m, i) => (
          <span key={i} className="ch-m" data-state={m.state} title={m.title} aria-label={m.title}>
            {m.i}
          </span>
        ))}
      </div>
    </article>
  );
}

function AlertsRail({
  s,
  stuck,
  onHideStuck,
  say,
  refresh,
}: {
  s: Snapshot;
  stuck: Card[];
  onHideStuck: (c: Card) => void;
  say: ReturnType<typeof useToast>["say"];
  refresh: () => void;
}) {
  const [gone, setGone] = useState<Set<number>>(new Set());
  // Acknowledged here but not yet gone from the snapshot: hidden at once, counted once.
  const shown = s.alerts.filter((a) => !gone.has(a.id));
  const pending = s.alerts.length - shown.length;
  const unacked = s.open_alerts - pending;
  const open = unacked + stuck.length;
  const ack = async (id: number) => {
    setGone((g) => new Set(g).add(id));
    const ok = await attempt(() => api.ackAlert(id), say);
    if (!ok)
      setGone((g) => {
        const next = new Set(g);
        next.delete(id);
        return next;
      });
    refresh();
  };
  const ackAll = async () => {
    await attempt(api.ackAllAlerts, say, "Alerts cleared.");
    stuck.forEach(onHideStuck);
    refresh();
  };
  return (
    <section className="ch-rail" aria-label="Alerts">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2.5">
        <h2 className="m-0 font-display text-[22px] font-normal">Alerts</h2>
        <div className="flex items-center gap-3">
          {open > 1 && (
            <button type="button" onClick={ackAll} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-[#5E3D20] underline">
              Clear all
            </button>
          )}
          <span className="font-mono text-[13px] font-semibold text-[#8E1B1B]">{Math.max(0, open)} OPEN</span>
        </div>
      </div>
      {open <= 0 && <p className="m-0 border-t border-[rgba(110,74,42,.25)] px-4 py-3 text-[15px] text-[#4A2F18]">No open alerts.</p>}
      {stuck.map((c) => (
        <AlertRow
          key={stuckKey(c)}
          tone="sea"
          title="Stuck over 10 minutes"
          body={`${c.team.name} in ${phaseWord(c.team.phase)} for ${Math.floor(c.stuckMs / 60_000)} min.${inactiveNote(c)}`}
          time={c.team.phase_since ? stamp(c.team.phase_since, s.game) : ""}
          onAck={() => onHideStuck(c)}
        />
      ))}
      {shown.slice(0, 60).map((a) => {
        const v = describeAlert(a);
        return <AlertRow key={a.id} tone={v.tone} title={v.title} body={v.body} time={stamp(a.at, s.game)} onAck={() => ack(a.id)} />;
      })}
      {shown.length > 60 && (
        <p className="m-0 border-t border-[rgba(110,74,42,.25)] px-4 py-3 text-sm text-[#5E3D20]">
          + {unacked - 60} more. Clear some to see the rest.
        </p>
      )}
    </section>
  );
}

const phaseWord = (p: string | null) =>
  p === "SEEKING" ? "Seek" : p === "CHECKING_IN" ? "Check in" : "Solve";
const inactiveNote = (c: Card) => {
  const off = c.team.members.filter((m) => !m.is_active).map((m) => m.name);
  return off.length ? ` ${off.join(", ")} ${off.length === 1 ? "is" : "are"} inactive.` : "";
};

function AlertRow({
  tone,
  title,
  body,
  time,
  onAck,
}: {
  tone: string;
  title: string;
  body: string;
  time: string;
  onAck: () => void;
}) {
  return (
    <div className="flex gap-2.5 border-t border-[rgba(110,74,42,.25)] px-3.5 py-3">
      <span className="ch-dot" data-tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-tight font-bold">{title}</div>
        <div className="text-sm leading-[1.35] text-[#4A2F18]">{body}</div>
        <div className="mt-0.5 font-mono text-xs text-[#5E3D20]">{time}</div>
      </div>
      <button
        type="button"
        aria-label={`Acknowledge: ${title}`}
        onClick={onAck}
        className="flex h-[34px] w-[34px] flex-none cursor-pointer items-center justify-center self-center rounded-lg border border-[rgba(110,74,42,.5)] bg-[rgba(255,255,255,.35)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2A1D12" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
    </div>
  );
}

function ShipsLog({ s }: { s: Snapshot }) {
  const lines = s.log
    .map((e) => ({ e, text: describeLog(e, s.rounds) }))
    .filter((l): l is { e: (typeof s.log)[number]; text: string } => l.text !== null)
    .slice(0, 12);
  return (
    <section aria-label="Timeline" className="ch-tile rounded-[14px] px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="m-0 font-display text-[22px] font-normal text-[#F3E6C8]">Ship&apos;s log</h2>
        <Link href="/admin/log" className="text-sm">
          Full log
        </Link>
      </div>
      {lines.length === 0 && <p className="m-0 text-sm text-[#BFA77F]">Nothing logged yet.</p>}
      <div aria-live="polite">
        {lines.map(({ e, text }) => (
          <div key={`${e.src}-${e.id}`} className="flex gap-3 border-t border-[rgba(226,190,114,.14)] py-[7px]">
            <span className="w-16 flex-none font-mono text-[13px] text-[#BFA77F]">{stamp(e.at, s.game)}</span>
            <span className="text-sm leading-[1.35] text-[#EADBB8]">{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
