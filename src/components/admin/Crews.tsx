"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useAdminSnapshot } from "@/hooks/useAdminSnapshot";
import * as api from "@/lib/admin/api";
import { started, stats } from "@/lib/admin/dashboard";
import type { Snapshot, SnapTeam } from "@/lib/admin/types";
import { TEAM_SIZE } from "@/lib/engine";
import { roman } from "@/lib/player/format";
import { JoinQrButton } from "./JoinQr";
import { NewGameDialog } from "./NewGame";
import { AdminHeader, AdminPage, attempt, ConfirmDialog, Toggle, Trouble, Unrolling, useToast, type Say } from "./parts";
import { TeamDrawer } from "./TeamDrawer";

/** /admin/crews (T-402): create crews, hand out codes, watch members join, rename, remove. */
export function Crews() {
  const { state, refresh } = useAdminSnapshot();
  const router = useRouter();
  const { say, toast } = useToast();
  useEffect(() => {
    if (state.kind === "error" && (state.code === "NOT_ADMIN" || state.code === "NOT_AUTHENTICATED"))
      router.replace("/admin/login");
  }, [state, router]);

  if (state.kind !== "ready")
    return (
      <AdminPage header={<AdminHeader />}>
        {state.kind === "loading" ? <Unrolling /> : <Trouble code={state.code} onRetry={refresh} />}
      </AdminPage>
    );
  const s = state.snap;
  const st = stats(s);
  return (
    <AdminPage
      header={
        <AdminHeader
          right={
            <span className="font-mono text-sm text-[#BFA77F]">
              {st.total} crews · {st.locked} sealed · {st.joined} players
            </span>
          }
        />
      }
    >
      <CrewsBody s={s} say={say} refresh={refresh} />
      {toast}
    </AdminPage>
  );
}

function CrewsBody({ s, say, refresh }: { s: Snapshot; say: Say; refresh: () => void }) {
  const [count, setCount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [newGame, setNewGame] = useState(false);
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const countId = useId();
  const g = s.game;
  const canCreate = g.status === "SETUP" || g.status === "REGISTRATION" || g.status === "READY";
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= 60;
  const team = s.teams.find((t) => t.id === openTeam);

  const create = async () => {
    if (!valid) return;
    setBusy(true);
    await attempt(() => api.createTeams(n), say, `${n} crew${n === 1 ? "" : "s"} created. Hand each its code.`);
    setBusy(false);
    refresh();
  };

  return (
    <div className="flex flex-wrap items-start gap-[22px] px-7 pt-[26px] pb-8">
      <aside className="flex min-w-0 flex-col gap-4" style={{ flex: "1 1 280px" }}>
        <section className="ch-asheet p-5" aria-label="Create crews">
          <h2 className="m-0 font-display text-2xl font-normal">Muster the crews</h2>
          <p className="mt-1 mb-4 text-sm text-[#5E3D20]">
            Each crew gets a secret 6-character code. Four players join with it; the fourth seals the crew.
          </p>
          <form
            className="flex items-end gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="w-24">
              <label htmlFor={countId} className="ch-lbl mb-1.5">
                CREWS
              </label>
              <input
                id={countId}
                className="ch-num"
                inputMode="numeric"
                value={count}
                aria-invalid={!valid}
                onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
            </div>
            <button type="submit" className="ch-awax h-10 flex-1 rounded-[10px] text-[15px]" disabled={!canCreate || !valid || busy}>
              {s.teams.length ? `Add ${valid ? n : ""} crews` : `Create ${valid ? n : ""} crews`}
            </button>
          </form>
          {!canCreate && <p className="m-0 mt-2 text-sm text-[#8E1B1B]">Crews can only be added before the hunt starts.</p>}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[rgba(110,74,42,.22)] pt-3.5">
            <span className="text-[15px] font-semibold">Joining {g.registration_open ? "open" : "closed"}</span>
            <Toggle
              on={g.registration_open}
              label={g.registration_open ? "Joining open" : "Joining closed"}
              disabled={!canCreate || !s.teams.length}
              onChange={(open) =>
                attempt(() => api.setRegistration(open), say, open ? "Joining is open." : "Joining is closed.").then(refresh)
              }
            />
          </div>
          <a
            href="/admin/print?sheet=codes"
            target="_blank"
            rel="noopener"
            className="ch-brass mt-3.5 flex h-[42px] items-center justify-center rounded-[10px] text-[15px] no-underline"
            aria-disabled={!s.teams.length}
          >
            Print code slips
          </a>
          <JoinQrButton
            label="Show the join QR"
            className="ch-plain mt-2 flex h-[42px] w-full items-center justify-center rounded-[10px] text-[15px]"
          />
        </section>
        <section className="ch-tile rounded-[14px] p-5" aria-label="New game">
          <h2 className="m-0 font-display text-xl font-normal text-[#F3E6C8]">New game</h2>
          <p className="mt-1 mb-3 text-sm leading-normal text-[#BFA77F]">
            Signs everyone out and clears players and progress. Crews stay with new codes; the printed QRs stay unless you
            regenerate them.
          </p>
          <button type="button" className="ch-iron h-10 w-full rounded-[10px] text-[15px]" onClick={() => setNewGame(true)}>
            Start a new game…
          </button>
        </section>
      </aside>

      <section aria-label="Crews" className="min-w-0" style={{ flex: "999 1 620px" }}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="m-0 font-display text-2xl font-normal text-[#F3E6C8]">The crews</h2>
          <span className="text-sm text-[#BFA77F]">Members appear as they join</span>
        </div>
        {s.teams.length === 0 ? (
          <div className="ch-tile px-5 py-6 text-[15px]">No crews yet. Create them on the left.</div>
        ) : (
          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {[...s.teams]
              .sort((a, b) => a.number - b.number)
              .map((t) => (
                <CrewCard key={t.id} t={t} s={s} say={say} refresh={refresh} onOpen={() => setOpenTeam(t.id)} />
              ))}
          </div>
        )}
      </section>
      {newGame && <NewGameDialog say={say} onClose={() => setNewGame(false)} onChanged={refresh} />}
      {team && <TeamDrawer s={s} team={team} say={say} onClose={() => setOpenTeam(null)} onChanged={refresh} />}
    </div>
  );
}

const STATUS: Record<string, string> = {
  forming: "Mustering",
  locked: "Sealed",
  active: "Racing",
  eliminated: "Eliminated",
  finished: "Finished",
  disqualified: "Disqualified",
};

function CrewCard({
  t,
  s,
  say,
  refresh,
  onOpen,
}: {
  t: SnapTeam;
  s: Snapshot;
  say: Say;
  refresh: () => void;
  onOpen: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(t.name);
  const [remove, setRemove] = useState(false);
  const [copied, setCopied] = useState(false);
  const before = !started(s.game);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      say("Couldn't copy. Select the code and copy it by hand.", "wax");
    }
  };
  const rename = async () => {
    const next = name.trim();
    if (next === t.name) return setRenaming(false);
    if (next.length < 2 || next.length > 40) return say("Crew names are 2–40 characters.", "wax");
    if (await attempt(() => api.renameTeam(t.id, next), say, `Renamed to ${next}.`)) setRenaming(false);
    refresh();
  };
  return (
    <article className="ch-card" aria-label={t.name}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void rename();
              }}
            >
              <input
                aria-label="Crew name"
                className="ch-inp py-1.5"
                value={name}
                maxLength={40}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="ch-brass h-9 rounded-lg px-2.5 text-sm">
                Save
              </button>
            </form>
          ) : (
            <div className="truncate font-display text-xl leading-[1.1]">{t.name}</div>
          )}
          <div className="mt-0.5 font-mono text-xs opacity-80">
            T{String(t.number).padStart(2, "0")} · {STATUS[t.status] ?? t.status}
            {t.round ? ` · Round ${roman(t.round)}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-[11px] tracking-[.16em] opacity-75">CODE</div>
          <button
            type="button"
            onClick={copy}
            title="Copy the code"
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[22px] font-semibold tracking-[.08em] text-[#2A1D12]"
          >
            {t.code}
          </button>
          <div className="h-4 text-[11px] text-[#4B6B3A]" aria-live="polite">
            {copied ? "copied" : ""}
          </div>
        </div>
      </div>
      <ul className="m-0 mt-2 list-none p-0" aria-label={`${t.name} members`}>
        {Array.from({ length: TEAM_SIZE }, (_, i) => {
          const m = t.members[i];
          return (
            <li key={m?.id ?? `empty-${i}`} className="flex h-8 items-center gap-2 border-t border-[rgba(110,74,42,.18)] text-[15px]">
              <span className="ch-m h-6 w-6 text-[11px]" data-state={m ? (m.is_active ? "done" : "off") : "wait"}>
                {m ? m.name.slice(0, 1).toUpperCase() : i + 1}
              </span>
              <span className={m ? (m.is_active ? "" : "line-through opacity-60") : "text-[#7A5A3A] italic"}>
                {m ? m.name : "empty seat"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" className="ch-plain h-8 rounded-lg px-2.5 text-sm" onClick={onOpen}>
          Members & overrides
        </button>
        {!renaming && (
          <button
            type="button"
            className="ch-plain h-8 rounded-lg px-2.5 text-sm"
            onClick={() => {
              setName(t.name);
              setRenaming(true);
            }}
          >
            Rename
          </button>
        )}
        {before && (
          <button type="button" className="ch-plain h-8 rounded-lg px-2.5 text-sm text-[#8E1B1B]" onClick={() => setRemove(true)}>
            Remove crew
          </button>
        )}
      </div>
      {remove && (
        <ConfirmDialog
          title={`Remove ${t.name}?`}
          body={
            t.members.length
              ? `Its ${t.members.length} member${t.members.length === 1 ? " is" : "s are"} signed out and deleted. The crew code stops working.`
              : "The crew code stops working."
          }
          confirmLabel="Remove crew"
          reason
          onConfirm={(reason) => attempt(() => api.deleteTeam(t.id, reason), say, `${t.name} removed.`).then((ok) => (refresh(), ok))}
          onClose={() => setRemove(false)}
        />
      )}
    </article>
  );
}
