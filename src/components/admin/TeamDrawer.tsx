"use client";

import { useEffect, useId, useState } from "react";
import * as api from "@/lib/admin/api";
import { started } from "@/lib/admin/dashboard";
import type { Snapshot, SnapTeam } from "@/lib/admin/types";
import { groupKey, roman } from "@/lib/player/format";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { attempt, ConfirmDialog, Modal, type Say } from "./parts";

type MarkOption = { id: string; label: string; spare: boolean; owners: string[]; place: string | null };

type Pending =
  | { kind: "inactive"; player: { id: string; name: string }; inactive: boolean }
  | { kind: "kick"; player: { id: string; name: string } }
  | { kind: "move"; round: number }
  | { kind: "repoint"; mark: MarkOption }
  | { kind: "force" }
  | { kind: "disqualify" };

/**
 * One crew up close: members, and the override toolkit (F15, T-408). Every override needs a reason and lands in
 * the audit log (SECURITY.md T13); the server re-checks each one.
 */
export function TeamDrawer({
  s,
  team,
  say,
  onClose,
  onChanged,
}: {
  s: Snapshot;
  team: SnapTeam;
  say: Say;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [marks, setMarks] = useState<MarkOption[]>([]);
  const [moveTo, setMoveTo] = useState<number>(team.round ?? 1);
  const [markId, setMarkId] = useState("");
  const moveId = useId();
  const markSel = useId();
  const racing = team.status === "active" && started(s.game);
  const openRounds = s.rounds.filter((r) => !r.closed_at);

  // Marks of the crew's current round, spares first (re-point: a damaged or stolen QR).
  useEffect(() => {
    if (!racing || !team.round) return;
    let gone = false;
    void (async () => {
      const supabase = getBrowserSupabase();
      const [{ data: qrs }, { data: owners }] = await Promise.all([
        supabase
          .from("qr_codes")
          .select("id, label, is_spare, locations(name)")
          .eq("round", team.round!)
          .order("label"),
        supabase.from("assignments").select("qr_id, teams(name)").eq("round", team.round!),
      ]);
      if (gone || !qrs) return;
      const by = new Map<string, string[]>();
      for (const o of owners ?? []) {
        const name = (o.teams as unknown as { name: string } | null)?.name;
        if (name) by.set(o.qr_id as string, [...(by.get(o.qr_id as string) ?? []), name]);
      }
      const list = qrs
        .filter((q) => q.label !== team.target)
        .map((q) => ({
          id: q.id as string,
          label: q.label as string,
          spare: q.is_spare as boolean,
          owners: by.get(q.id as string) ?? [],
          place: (q.locations as unknown as { name: string } | null)?.name ?? null,
        }))
        .sort((a, b) => Number(b.spare) - Number(a.spare) || a.label.localeCompare(b.label));
      setMarks(list);
      setMarkId(list[0]?.id ?? "");
    })();
    return () => {
      gone = true;
    };
  }, [racing, team.round, team.target]);

  const done = async (action: () => Promise<unknown>, text: string) => {
    const ok = await attempt(action, say, text);
    onChanged();
    return ok;
  };

  return (
    <Modal title={team.name} onClose={onClose} width={640}>
      <div className="flex flex-col gap-4">
        <p className="m-0 font-mono text-[13px] text-[#5E3D20]">
          T{String(team.number).padStart(2, "0")} · {team.code} · {team.status}
          {team.round ? ` · Round ${roman(team.round)}` : ""}
          {team.phase ? ` · ${team.phase.replace("_", " ").toLowerCase()}` : ""}
          {team.target ? ` · mark ${team.target}` : ""}
        </p>

        {team.status === "finished" && team.completion_key && (
          <div className="rounded-xl bg-[rgba(75,107,58,.14)] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(75,107,58,.5)]">
            <div className="ch-lbl">COMPLETION KEY · {team.final_rank} PLACE</div>
            <div className="mt-1 font-mono text-[26px] font-semibold tracking-[.12em]">{groupKey(team.completion_key)}</div>
            <p className="m-0 mt-1 text-sm text-[#4A2F18]">Match it with the key on the crew&apos;s phones.</p>
          </div>
        )}

        <section aria-label="Members">
          <div className="ch-lbl mb-1">MEMBERS</div>
          {team.members.length === 0 && <p className="m-0 text-[15px] text-[#5E3D20]">Nobody has joined yet.</p>}
          {team.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 border-t border-[rgba(110,74,42,.22)] py-2">
              <div className="min-w-0 flex-1">
                <div className={`text-base font-semibold ${m.is_active ? "" : "line-through opacity-60"}`}>{m.name}</div>
                <div className="text-[13px] text-[#5E3D20]">
                  {!m.is_active
                    ? "inactive"
                    : !team.phase
                      ? "aboard"
                      : [m.opened && "question open", m.solved && "piece solved", m.checked_in ? "checked in" : m.scanned && "scanned"]
                          .filter(Boolean)
                          .join(" · ") || "waiting"}
                </div>
              </div>
              {started(s.game) && team.status === "active" && (
                <button
                  type="button"
                  className="ch-plain h-9 rounded-[9px] px-3 text-sm"
                  onClick={() => setPending({ kind: "inactive", player: m, inactive: m.is_active })}
                >
                  {m.is_active ? "Mark inactive" : "Make active"}
                </button>
              )}
              <button
                type="button"
                className="ch-plain h-9 rounded-[9px] px-3 text-sm"
                onClick={() => setPending({ kind: "kick", player: m })}
              >
                Remove
              </button>
            </div>
          ))}
        </section>

        {racing && (
          <section aria-label="Overrides" className="flex flex-col gap-3 border-t border-[rgba(110,74,42,.3)] pt-3">
            <div className="ch-lbl">OVERRIDES · EACH NEEDS A REASON</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label htmlFor={moveId} className="text-sm font-semibold">
                  Move the crew to round
                </label>
                <select
                  id={moveId}
                  className="ch-inp mt-1"
                  value={moveTo}
                  onChange={(e) => setMoveTo(Number(e.target.value))}
                >
                  {openRounds.map((r) => (
                    <option key={r.number} value={r.number}>
                      Round {roman(r.number)}
                      {r.number === team.round ? " (restart this round)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="ch-brass h-10 rounded-[10px] px-3.5 text-[15px]"
                disabled={!openRounds.length}
                onClick={() => setPending({ kind: "move", round: moveTo })}
              >
                Move
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label htmlFor={markSel} className="text-sm font-semibold">
                  Re-point to another Round {roman(team.round ?? 1)} mark (damaged or stolen QR)
                </label>
                <select id={markSel} className="ch-inp mt-1" value={markId} onChange={(e) => setMarkId(e.target.value)}>
                  {marks.length === 0 && <option value="">No other mark in this round</option>}
                  {marks.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.place ? ` · ${m.place}` : ""}
                      {m.spare ? " · spare" : m.owners.length ? ` · also ${m.owners.join(", ")}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="ch-brass h-10 rounded-[10px] px-3.5 text-[15px]"
                disabled={!markId}
                onClick={() => {
                  const mark = marks.find((m) => m.id === markId);
                  if (mark) setPending({ kind: "repoint", mark });
                }}
              >
                Re-point
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="ch-brass h-10 rounded-[10px] px-3.5 text-[15px]"
                onClick={() => setPending({ kind: "force" })}
              >
                Complete this round by hand
              </button>
              <button
                type="button"
                className="ch-awax h-10 rounded-[10px] px-4 text-[15px]"
                onClick={() => setPending({ kind: "disqualify" })}
              >
                Disqualify crew
              </button>
            </div>
          </section>
        )}
      </div>

      {pending?.kind === "inactive" && (
        <ConfirmDialog
          title={pending.inactive ? `Mark ${pending.player.name} inactive?` : `Bring ${pending.player.name} back?`}
          body={
            pending.inactive
              ? "The crew carries on with the others. Their unsolved piece unlocks, and they no longer need to check in."
              : "They count again from the next check-in."
          }
          confirmLabel={pending.inactive ? "Mark inactive" : "Make active"}
          reason
          onConfirm={(reason) =>
            done(
              () => api.setMemberInactive(pending.player.id, pending.inactive, reason),
              `${pending.player.name} is ${pending.inactive ? "inactive" : "active again"}.`,
            )
          }
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "kick" && (
        <ConfirmDialog
          title={`Remove ${pending.player.name}?`}
          body="Their phone is signed out and their account deleted. Their seat opens, so someone else can join with the crew code."
          confirmLabel="Remove player"
          reason
          onConfirm={(reason) => done(() => api.kickPlayer(pending.player.id, reason), `${pending.player.name} was removed.`)}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "move" && (
        <ConfirmDialog
          title={`Move ${team.name} to Round ${roman(pending.round)}?`}
          body="Their progress from that round on is cleared and the round starts fresh, with new questions."
          confirmLabel="Move crew"
          reason
          onConfirm={(reason) =>
            done(() => api.moveTeam(team.id, pending.round, reason), `${team.name} is in Round ${roman(pending.round)}.`)
          }
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "repoint" && (
        <ConfirmDialog
          title={`Re-point ${team.name} to ${pending.mark.label}?`}
          body={`From this round on the crew follows ${pending.mark.label}${pending.mark.place ? ` (${pending.mark.place})` : ""} and its links. Anyone who already scanned their old mark this round scans the new one.`}
          confirmLabel="Re-point"
          reason
          onConfirm={(reason) =>
            done(() => api.repointTeam(team.id, pending.mark.id, reason), `${team.name} now seeks ${pending.mark.label}.`)
          }
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "force" && (
        <ConfirmDialog
          title={`Complete Round ${roman(team.round ?? 1)} for ${team.name}?`}
          body="It counts as sealed now, in the order of completion. If the round is already sealed, the crew is eliminated."
          confirmLabel="Complete round"
          reason
          typed="COMPLETE"
          onConfirm={(reason) => done(() => api.forceComplete(team.id, reason), `${team.name}'s round was completed.`)}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === "disqualify" && (
        <ConfirmDialog
          title={`Disqualify ${team.name}?`}
          body="The crew is out of the hunt at once. This can't be undone."
          confirmLabel="Disqualify"
          reason
          typed="DISQUALIFY"
          onConfirm={(reason) => done(() => api.disqualifyTeam(team.id, reason), `${team.name} was disqualified.`)}
          onClose={() => setPending(null)}
        />
      )}
    </Modal>
  );
}
