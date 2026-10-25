"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminError, check } from "@/lib/admin/api";
import { MAX_DIFFICULTY } from "@/lib/engine";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { AdminHeader, AdminPage, Trouble, Unrolling } from "./parts";

type Q = { id: string; text: string; format: "mcq" | "text" | "number"; difficulty: number; category: string | null; is_enabled: boolean };

const FORMAT = { mcq: "A/B/C/D", text: "one word", number: "a number" } as const;

/**
 * /admin/questions: what the bank holds, by difficulty and format, so the captain can see whether a course is
 * covered. Adding, editing and CSV import are Phase 5 (T-501); answers are never shown here.
 */
export function Questions() {
  const [qs, setQs] = useState<Q[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setQs(
        check(
          await getBrowserSupabase()
            .from("questions")
            .select("id, text, format, difficulty, category, is_enabled")
            .order("difficulty")
            .order("created_at")
            .limit(2000),
        ) as Q[],
      );
    } catch (e) {
      setError(e instanceof AdminError ? e.code : "SERVER");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const enabled = qs?.filter((q) => q.is_enabled) ?? [];
  const header = <AdminHeader right={qs && <span className="font-mono text-sm text-[#BFA77F]">{enabled.length} enabled · {qs.length} in the bank</span>} />;
  if (error) return <AdminPage header={header}><Trouble code={error} onRetry={load} /></AdminPage>;
  if (!qs) return <AdminPage header={header}><Unrolling /></AdminPage>;

  return (
    <AdminPage header={header}>
      <div className="flex flex-wrap items-start gap-[22px] px-7 pt-[26px] pb-8">
        <section className="ch-asheet min-w-0 p-5" style={{ flex: "1 1 320px" }} aria-label="Coverage">
          <h2 className="m-0 font-display text-2xl font-normal">The bank</h2>
          <p className="mt-1 mb-3 text-sm text-[#5E3D20]">
            Each crew needs 4 unseen questions per round, near the round&apos;s difficulty. Adding, editing and CSV import
            arrive with the question bank (Phase 5).
          </p>
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr className="text-left">
                <th className="ch-lbl py-1.5 font-normal">DIFFICULTY</th>
                <th className="ch-lbl py-1.5 font-normal">A/B/C/D</th>
                <th className="ch-lbl py-1.5 font-normal">WORD</th>
                <th className="ch-lbl py-1.5 font-normal">NUMBER</th>
                <th className="ch-lbl py-1.5 font-normal">ENABLED</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_DIFFICULTY }, (_, i) => i + 1).map((d) => {
                const at = enabled.filter((q) => q.difficulty === d);
                return (
                  <tr key={d} className="border-t border-[rgba(110,74,42,.22)] font-mono">
                    <td className="py-1.5">{"●".repeat(d)}{"○".repeat(MAX_DIFFICULTY - d)}</td>
                    <td>{at.filter((q) => q.format === "mcq").length}</td>
                    <td>{at.filter((q) => q.format === "text").length}</td>
                    <td>{at.filter((q) => q.format === "number").length}</td>
                    <td className="font-semibold">{at.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="ch-asheet min-w-0 p-5" style={{ flex: "999 1 560px" }} aria-label="Questions">
          <h2 className="m-0 mb-2 font-display text-2xl font-normal">Questions</h2>
          {qs.length === 0 && <p className="m-0 text-[15px] text-[#4A2F18]">The bank is empty. Questions are added in Phase 5.</p>}
          <ul className="m-0 list-none p-0">
            {qs.slice(0, 300).map((q) => (
              <li key={q.id} className={`flex gap-3 border-t border-[rgba(110,74,42,.22)] py-2 text-[15px] ${q.is_enabled ? "" : "opacity-50"}`}>
                <span className="w-14 flex-none font-mono text-xs text-[#5E3D20]">{"●".repeat(q.difficulty)}</span>
                <span className="min-w-0 flex-1">{q.text}</span>
                <span className="flex-none font-mono text-xs text-[#5E3D20]">
                  {FORMAT[q.format]}
                  {q.category ? ` · ${q.category}` : ""}
                  {q.is_enabled ? "" : " · off"}
                </span>
              </li>
            ))}
          </ul>
          {qs.length > 300 && <p className="m-0 mt-2 text-sm text-[#5E3D20]">+ {qs.length - 300} more</p>}
        </section>
      </div>
    </AdminPage>
  );
}
