"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AdminError, check } from "@/lib/admin/api";
import { download, toCsv } from "@/lib/admin/csv";
import { describeLog } from "@/lib/admin/describe";
import type { LogEntry } from "@/lib/admin/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { AdminHeader, AdminPage, Trouble, Unrolling } from "./parts";

type Row = LogEntry & { teamId: string | null };

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * /admin/log (T-408, F16): the admin audit (every action and its reason, kept across games) and this game's ship's
 * log, newest first, with server timestamps for disputes (SECURITY.md T13).
 */
export function Log() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const filterId = useId();

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase();
    try {
      const [ev, au, tm, pl, qr] = await Promise.all([
        supabase.from("events").select("id, team_id, player_id, kind, data, at").order("at", { ascending: false }).limit(1000),
        supabase.from("admin_audit").select("id, action, target, reason, data, at").order("at", { ascending: false }).limit(500),
        supabase.from("teams").select("id, name").order("number"),
        supabase.from("players").select("id, name, team_id"),
        supabase.from("qr_codes").select("label, locations(name)"),
      ]);
      const teamList = check(tm) as { id: string; name: string }[];
      const teamName = new Map(teamList.map((t) => [t.id, t.name]));
      const players = check(pl) as { id: string; name: string; team_id: string }[];
      const player = new Map(players.map((p) => [p.id, p]));
      const place = new Map(
        (check(qr) as unknown as { label: string; locations: { name: string } | null }[]).map((q) => [q.label, q.locations?.name ?? null]),
      );
      const events = (check(ev) as { id: number; team_id: string | null; player_id: string | null; kind: string; data: Record<string, unknown>; at: string }[])
        .filter((e) => !e.kind.startsWith("alert:") && e.kind !== "mcq_swapped")
        .map(
          (e): Row => ({
            src: "event",
            id: e.id,
            kind: e.kind,
            data: e.data,
            at: e.at,
            team: e.team_id ? (teamName.get(e.team_id) ?? null) : null,
            player: e.player_id ? (player.get(e.player_id)?.name ?? null) : null,
            reason: null,
            target: null,
            place: typeof e.data?.qr === "string" ? (place.get(e.data.qr) ?? null) : null,
            teamId: e.team_id,
          }),
        );
      const audit = (check(au) as { id: number; action: string; target: string | null; reason: string | null; data: Record<string, unknown>; at: string }[]).map(
        (a): Row => {
          const p = a.target ? player.get(a.target) : undefined;
          const teamId = p?.team_id ?? (a.target && teamName.has(a.target) ? a.target : null);
          return {
            src: "audit",
            id: a.id,
            kind: a.action,
            data: a.data,
            at: a.at,
            team: teamId ? (teamName.get(teamId) ?? null) : null,
            player: p?.name ?? null,
            reason: a.reason,
            target: a.target,
            place: null,
            teamId,
          };
        },
      );
      setTeams(teamList);
      setRows([...events, ...audit].sort((x, y) => Date.parse(y.at) - Date.parse(x.at) || y.id - x.id));
      setError(null);
    } catch (e) {
      setError(e instanceof AdminError ? e.code : "SERVER");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const lines = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => (filter === "all" ? true : filter === "audit" ? r.src === "audit" : r.teamId === filter))
        .map((r) => ({ r, text: describeLog(r) ?? `${r.src === "audit" ? "Captain" : (r.team ?? "Hunt")} · ${r.kind.replace(/_/g, " ")}${r.reason ? ` · reason: ${r.reason}` : ""}` })),
    [rows, filter],
  );

  const header = <AdminHeader right={rows && <span className="font-mono text-sm text-[#BFA77F]">{rows.length} entries</span>} />;
  if (error) return <AdminPage header={header}><Trouble code={error} onRetry={load} /></AdminPage>;
  if (!rows) return <AdminPage header={header}><Unrolling /></AdminPage>;

  return (
    <AdminPage header={header}>
      <div className="px-7 pt-[26px] pb-8">
        <section className="ch-asheet mx-auto max-w-[980px] p-5" aria-label="Log">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="m-0 font-display text-[28px] font-normal">The full log</h2>
              <p className="m-0 mt-1 text-sm text-[#5E3D20]">
                Server times. The captain&apos;s actions are kept across games; crew events are cleared by New Game.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label htmlFor={filterId} className="ch-lbl mb-1">
                  SHOW
                </label>
                <select id={filterId} className="ch-inp w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">Everything</option>
                  <option value="audit">Captain&apos;s actions</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="ch-brass h-10 rounded-[10px] px-3.5 text-[15px]" onClick={() => void load()}>
                Refresh
              </button>
              <button
                type="button"
                className="ch-brass h-10 rounded-[10px] px-3.5 text-[15px]"
                onClick={() =>
                  download(
                    `crypto-hunt-log-${new Date().toISOString().slice(0, 10)}.csv`,
                    toCsv([["At", "Source", "Team", "Player", "Entry", "Reason"], ...lines.map(({ r, text }) => [r.at, r.src, r.team, r.player, text, r.reason])]),
                  )
                }
              >
                Download
              </button>
            </div>
          </div>
          {lines.length === 0 && <p className="m-0 text-[15px] text-[#4A2F18]">Nothing logged yet.</p>}
          <ol className="m-0 list-none p-0">
            {lines.map(({ r, text }) => (
              <li key={`${r.src}-${r.id}`} className="flex gap-3 border-t border-[rgba(110,74,42,.22)] py-1.5 text-[15px]">
                <span className="w-[150px] flex-none font-mono text-xs leading-6 text-[#5E3D20]">{when(r.at)}</span>
                {r.src === "audit" && (
                  <span className="flex-none self-start rounded bg-[#2A1D12] px-1.5 py-0.5 font-display text-[11px] tracking-[.1em] text-[#F3E6C8]">
                    CAPTAIN
                  </span>
                )}
                <span className="min-w-0 flex-1 leading-6">{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AdminPage>
  );
}
