"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AdminError,
  deleteQuestion,
  getQuestion,
  insertQuestions,
  listQuestions,
  saveQuestion,
  setQuestionEnabled,
  type QuestionRow,
} from "@/lib/admin/api";
import { download } from "@/lib/admin/csv";
import {
  checkQuestion,
  csvTemplate,
  draftOf,
  emptyDraft,
  importQuestions,
  LETTERS,
  type ImportReport,
  type QuestionDraft,
} from "@/lib/admin/questions";
import { MAX_DIFFICULTY } from "@/lib/engine";
import { AdminHeader, AdminPage, attempt, ConfirmDialog, Modal, Trouble, Unrolling, useToast, type Say } from "./parts";

const FORMAT = { mcq: "A/B/C/D", text: "one word", number: "a number" } as const;
const dots = (d: number) => "●".repeat(d) + "○".repeat(MAX_DIFFICULTY - d);

type Filters = { q: string; difficulty: string; format: string; category: string; state: string };
const NO_FILTERS: Filters = { q: "", difficulty: "", format: "", category: "", state: "" };

/**
 * /admin/questions (F18, T-501): coverage by difficulty and format, the bank with filters, the editor and the CSV
 * import with a per-row report. Answers appear only inside the editor, never in the list.
 */
export function Questions() {
  const [qs, setQs] = useState<QuestionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { say, toast } = useToast();
  const load = useCallback(async () => {
    try {
      setQs(await listQuestions());
      setError(null);
    } catch (e) {
      setError(e instanceof AdminError ? e.code : "SERVER");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const enabled = qs?.filter((q) => q.is_enabled) ?? [];
  const header = (
    <AdminHeader
      right={qs && <span className="font-mono text-sm text-[#BFA77F]">{enabled.length} enabled · {qs.length} in the bank</span>}
    />
  );
  if (error) return <AdminPage header={header}><Trouble code={error} onRetry={load} /></AdminPage>;
  if (!qs) return <AdminPage header={header}><Unrolling /></AdminPage>;

  return (
    <AdminPage header={header}>
      <div className="flex flex-wrap items-start gap-[22px] px-7 pt-[26px] pb-8">
        <div className="flex min-w-0 flex-col gap-[22px]" style={{ flex: "1 1 320px" }}>
          <Coverage enabled={enabled} />
          <Import bank={qs} say={say} onDone={load} />
        </div>
        <Bank qs={qs} say={say} reload={load} />
      </div>
      {toast}
    </AdminPage>
  );
}

function Coverage({ enabled }: { enabled: QuestionRow[] }) {
  return (
    <section className="ch-asheet min-w-0 p-5" aria-label="Coverage">
      <h2 className="m-0 font-display text-2xl font-normal">The bank</h2>
      <p className="mt-1 mb-3 text-sm text-[#5E3D20]">
        Each crew needs 4 unseen questions per round, near the round&apos;s difficulty. Wrong multiple-choice picks swap in
        a fresh one, so keep plenty at every level.
      </p>
      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr className="text-left">
            <th className="ch-lbl table-cell py-1.5 pr-2 font-normal">LEVEL</th>
            <th className="ch-lbl table-cell py-1.5 pr-2 font-normal" title="Multiple choice">A–D</th>
            <th className="ch-lbl table-cell py-1.5 pr-2 font-normal">WORD</th>
            <th className="ch-lbl table-cell py-1.5 pr-2 font-normal" title="Number">NUM</th>
            <th className="ch-lbl table-cell py-1.5 font-normal" title="Enabled at this level">ALL</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: MAX_DIFFICULTY }, (_, i) => i + 1).map((d) => {
            const at = enabled.filter((q) => q.difficulty === d);
            return (
              <tr key={d} className="border-t border-[rgba(110,74,42,.22)] font-mono">
                <td className="py-1.5">{dots(d)}</td>
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
  );
}

// ── The bank: filters, list, editor ─────────────────────────────────────────────────────────────────

function Bank({ qs, say, reload }: { qs: QuestionRow[]; say: Say; reload: () => Promise<void> }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [limit, setLimit] = useState(200);
  const ids = { q: useId(), d: useId(), fm: useId(), c: useId(), s: useId() };
  const categories = useMemo(
    () => [...new Set(qs.map((q) => q.category).filter((c): c is string => !!c))].sort(),
    [qs],
  );
  const shown = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return qs.filter(
      (q) =>
        (!needle || q.text.toLowerCase().includes(needle)) &&
        (!f.difficulty || q.difficulty === Number(f.difficulty)) &&
        (!f.format || q.format === f.format) &&
        (!f.category || (f.category === "-" ? !q.category : q.category === f.category)) &&
        (!f.state || (f.state === "on" ? q.is_enabled : !q.is_enabled)),
    );
  }, [qs, f]);
  const set = (patch: Partial<Filters>) => {
    setF((x) => ({ ...x, ...patch }));
    setLimit(200);
  };

  return (
    <section className="ch-asheet min-w-0 p-5" style={{ flex: "999 1 560px" }} aria-label="Questions">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="m-0 font-display text-2xl font-normal">Questions</h2>
        <span className="font-mono text-sm text-[#5E3D20]">
          {shown.length === qs.length ? `${qs.length}` : `${shown.length} of ${qs.length}`}
        </span>
        <button type="button" className="ch-awax ml-auto h-[40px] rounded-[10px] px-4 text-base" onClick={() => setEditing("new")}>
          New question
        </button>
      </div>
      <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: "minmax(160px, 2fr) repeat(4, minmax(110px, 1fr))" }}>
        <div>
          <label className="ch-lbl" htmlFor={ids.q}>SEARCH</label>
          <input id={ids.q} className="ch-inp mt-1" value={f.q} placeholder="Words in the question" onChange={(e) => set({ q: e.target.value })} />
        </div>
        <Pick id={ids.d} label="DIFFICULTY" value={f.difficulty} onChange={(v) => set({ difficulty: v })}
          options={Array.from({ length: MAX_DIFFICULTY }, (_, i) => [String(i + 1), dots(i + 1)])} />
        <Pick id={ids.fm} label="FORMAT" value={f.format} onChange={(v) => set({ format: v })}
          options={Object.entries(FORMAT)} />
        <Pick id={ids.c} label="CATEGORY" value={f.category} onChange={(v) => set({ category: v })}
          options={[...categories.map((c) => [c, c] as [string, string]), ["-", "(none)"]]} />
        <Pick id={ids.s} label="STATE" value={f.state} onChange={(v) => set({ state: v })}
          options={[["on", "enabled"], ["off", "turned off"]]} />
      </div>
      {qs.length === 0 && <p className="m-0 text-[15px] text-[#4A2F18]">The bank is empty. Add a question or import a CSV.</p>}
      {qs.length > 0 && shown.length === 0 && (
        <p className="m-0 text-[15px] text-[#4A2F18]">
          Nothing matches.{" "}
          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[#8E1B1B] underline" onClick={() => set(NO_FILTERS)}>
            Clear the filters
          </button>
        </p>
      )}
      <ul className="m-0 list-none p-0">
        {shown.slice(0, limit).map((q) => (
          <li key={q.id} className={`border-t border-[rgba(110,74,42,.22)] ${q.is_enabled ? "" : "opacity-50"}`}>
            <button
              type="button"
              className="flex w-full cursor-pointer gap-3 border-0 bg-transparent px-0 py-2 text-left text-[15px] text-inherit hover:bg-[rgba(110,74,42,.08)]"
              aria-label={`Edit: ${q.text}`}
              onClick={() => setEditing(q.id)}
            >
              <span className="w-14 flex-none font-mono text-xs text-[#5E3D20]">{"●".repeat(q.difficulty)}</span>
              <span className="min-w-0 flex-1">{q.text}</span>
              <span className="flex-none font-mono text-xs text-[#5E3D20]">
                {FORMAT[q.format]}
                {q.category ? ` · ${q.category}` : ""}
                {q.is_enabled ? "" : " · off"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {shown.length > limit && (
        <button type="button" className="ch-plain mt-3 h-[40px] rounded-[10px] px-4" onClick={() => setLimit((n) => n + 200)}>
          Show {Math.min(200, shown.length - limit)} more
        </button>
      )}
      {editing && (
        <Editor
          id={editing === "new" ? null : editing}
          row={editing === "new" ? null : (qs.find((q) => q.id === editing) ?? null)}
          say={say}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </section>
  );
}

function Pick({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="ch-lbl" htmlFor={id}>{label}</label>
      <select id={id} className="ch-inp mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">all</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

function Editor({
  id,
  row,
  say,
  onClose,
  onSaved,
}: {
  id: string | null;
  row: QuestionRow | null;
  say: Say;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [d, setD] = useState<QuestionDraft | null>(id ? null : emptyDraft());
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(false);
  const f = { text: useId(), diff: useId(), ans: useId(), alt: useId(), hint: useId(), cat: useId() };

  // Load once per question; the callbacks change every render, so read them through a ref.
  const cb = useRef({ say, onClose });
  cb.current = { say, onClose };
  useEffect(() => {
    if (!id) return;
    let live = true;
    getQuestion(id)
      .then((q) => live && setD(draftOf(q)))
      .catch(() => {
        if (!live) return;
        cb.current.say("Couldn't open that question. Try again.", "wax");
        cb.current.onClose();
      });
    return () => {
      live = false;
    };
  }, [id]);

  const set = (patch: Partial<QuestionDraft>) => {
    setD((x) => (x ? { ...x, ...patch } : x));
    setErrors([]);
  };
  const save = async () => {
    if (!d) return;
    const r = checkQuestion(d);
    if (!r.ok) return setErrors(r.errors);
    setBusy(true);
    const ok = await attempt(() => saveQuestion(id, r.value), say, id ? "Question saved." : "Question added.");
    setBusy(false);
    if (ok) await onSaved();
  };
  const toggle = async () => {
    if (!id || !row) return;
    setBusy(true);
    const ok = await attempt(() => setQuestionEnabled(id, !row.is_enabled), say, row.is_enabled ? "Turned off: it won't be dealt." : "Turned on.");
    setBusy(false);
    if (ok) await onSaved();
  };

  return (
    <Modal title={id ? "Edit question" : "New question"} onClose={onClose} width={600}>
      {!d ? (
        <Unrolling text="Opening…" />
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
            <legend className="ch-lbl mb-1 p-0">FORMAT</legend>
            {(Object.keys(FORMAT) as (keyof typeof FORMAT)[]).map((k) => (
              <label key={k} className={`cursor-pointer rounded-[10px] px-3 py-2 text-[15px] ${d.format === k ? "bg-[#2A1D12] text-[#F7E9C8]" : "bg-[rgba(110,74,42,.12)]"}`}>
                <input
                  type="radio"
                  name="format"
                  className="sr-only"
                  checked={d.format === k}
                  onChange={() => set({ format: k, answer: k === "mcq" ? "A" : "", hint: k === "mcq" ? "" : d.hint, alternatives: k === "mcq" ? "" : d.alternatives })}
                />
                {k === "mcq" ? "Multiple choice" : k === "text" ? "One word" : "Number"}
              </label>
            ))}
          </fieldset>
          <div>
            <label className="ch-lbl" htmlFor={f.text}>QUESTION</label>
            <textarea id={f.text} className="ch-inp mt-1 min-h-[84px]" maxLength={600} value={d.text} onChange={(e) => set({ text: e.target.value })} />
          </div>
          {d.format === "mcq" ? (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="ch-lbl mb-1 p-0">OPTIONS · TICK THE RIGHT ONE (SHUFFLED FOR EACH PLAYER)</legend>
              {LETTERS.map((L, i) => (
                <div key={L} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="right"
                    aria-label={`${L} is right`}
                    checked={d.answer.toUpperCase() === L}
                    onChange={() => set({ answer: L })}
                  />
                  <span className="w-5 font-display text-lg">{L}</span>
                  <input
                    className="ch-inp"
                    aria-label={`Option ${L}`}
                    maxLength={200}
                    value={d.options[i]}
                    onChange={(e) => {
                      const options = [...d.options] as QuestionDraft["options"];
                      options[i] = e.target.value;
                      set({ options });
                    }}
                  />
                </div>
              ))}
            </fieldset>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ch-lbl" htmlFor={f.ans}>ANSWER</label>
                <input id={f.ans} className="ch-inp mt-1" maxLength={120} inputMode={d.format === "number" ? "decimal" : undefined} value={d.answer} onChange={(e) => set({ answer: e.target.value })} />
              </div>
              <div>
                <label className="ch-lbl" htmlFor={f.alt}>OTHER ANSWERS · USE |</label>
                <input id={f.alt} className="ch-inp mt-1" value={d.alternatives} placeholder={d.format === "number" ? "e.g. 4.0" : "e.g. the moon | luna"} onChange={(e) => set({ alternatives: e.target.value })} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-[120px_1fr_1fr] gap-3">
            <div>
              <label className="ch-lbl" htmlFor={f.diff}>DIFFICULTY</label>
              <select id={f.diff} className="ch-inp mt-1" value={d.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>
                {Array.from({ length: MAX_DIFFICULTY }, (_, i) => (
                  <option key={i} value={String(i + 1)}>{i + 1} {dots(i + 1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ch-lbl" htmlFor={f.hint}>HINT{d.format === "mcq" ? " · NONE FOR MULTIPLE CHOICE" : ""}</label>
              <input id={f.hint} className="ch-inp mt-1" maxLength={300} disabled={d.format === "mcq"} value={d.hint} onChange={(e) => set({ hint: e.target.value })} />
            </div>
            <div>
              <label className="ch-lbl" htmlFor={f.cat}>CATEGORY</label>
              <input id={f.cat} className="ch-inp mt-1" maxLength={40} value={d.category} placeholder="e.g. coding" onChange={(e) => set({ category: e.target.value })} />
            </div>
          </div>
          {errors.length > 0 && (
            <ul role="alert" className="m-0 list-disc rounded-[10px] bg-[rgba(142,27,27,.1)] py-2 pr-3 pl-7 text-[15px] text-[#8E1B1B]">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            <button type="submit" className="ch-awax h-[46px] flex-1 rounded-[11px] text-base" disabled={busy}>
              {id ? "Save" : "Add question"}
            </button>
            {id && row && (
              <button type="button" className="ch-plain h-[46px] rounded-[11px] px-4" disabled={busy} onClick={() => void toggle()}>
                {row.is_enabled ? "Turn off" : "Turn on"}
              </button>
            )}
            {id && (
              <button type="button" className="ch-plain h-[46px] rounded-[11px] px-4" disabled={busy} onClick={() => setRemove(true)}>
                Delete
              </button>
            )}
          </div>
        </form>
      )}
      {remove && id && (
        <ConfirmDialog
          title="Delete this question?"
          body="It leaves the bank for good. To keep it but stop it being dealt, turn it off instead."
          confirmLabel="Delete"
          onClose={() => setRemove(false)}
          onConfirm={async () => {
            const ok = await attempt(() => deleteQuestion(id), say, "Question deleted.");
            if (ok) await onSaved();
            return ok;
          }}
        />
      )}
    </Modal>
  );
}

// ── CSV import ──────────────────────────────────────────────────────────────────────────────────────

function Import({ bank, say, onDone }: { bank: QuestionRow[]; say: Say; onDone: () => Promise<void> }) {
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const bad = report?.rows.filter((r) => r.errors.length) ?? [];

  const read = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return say("That file is over 2 MB. Split it into smaller files.", "wax");
    setName(f.name);
    setReport(importQuestions(await f.text(), bank.map((q) => q.text)));
    if (file.current) file.current.value = "";
  };
  const run = async () => {
    if (!report?.valid.length) return;
    setBusy(true);
    setProgress(0);
    let done = 0;
    const track = (n: number) => {
      done = n;
      setProgress(n);
    };
    const ok = await attempt(() => insertQuestions(report.valid, track), say);
    setBusy(false);
    if (ok) say(`Imported ${done} question${done === 1 ? "" : "s"}${bad.length ? `; ${bad.length} row${bad.length === 1 ? "" : "s"} skipped` : ""}.`, "moss");
    else if (done) say(`Stopped after ${done}. Import the file again: questions already in the bank are skipped.`, "wax");
    setReport(null);
    setName(null);
    await onDone();
  };

  return (
    <section className="ch-asheet min-w-0 p-5" aria-label="Import">
      <h2 className="m-0 font-display text-2xl font-normal">Import a CSV</h2>
      <p className="mt-1 mb-3 text-sm text-[#5E3D20]">
        One question per row. Columns: difficulty, format (mcq, text or number), text, answer (A–D for multiple choice), and
        option_a–option_d, alternatives (separated by |), hint, category as needed. Every row is checked first.
      </p>
      <input ref={file} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => void read(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ch-brass h-[40px] rounded-[10px] px-4 text-base" disabled={busy} onClick={() => file.current?.click()}>
          Choose a file
        </button>
        <button type="button" className="ch-plain h-[40px] rounded-[10px] px-4" onClick={() => download("questions-template.csv", csvTemplate())}>
          Download the template
        </button>
      </div>
      {report && (
        <div className="mt-4" aria-live="polite">
          <p className="m-0 font-semibold text-[15px]">{name}</p>
          {report.problem ? (
            <p role="alert" className="m-0 mt-1 text-[15px] text-[#8E1B1B]">{report.problem}</p>
          ) : (
            <>
              <p className="m-0 mt-1 text-[15px]">
                <span className="font-semibold text-[#3A552C]">{report.valid.length} ready</span>
                {bad.length > 0 && <span className="font-semibold text-[#8E1B1B]"> · {bad.length} with problems (skipped)</span>}
              </p>
              {bad.length > 0 && (
                <table className="mt-2 w-full border-collapse text-sm" aria-label="Rows with problems">
                  <thead>
                    <tr className="text-left">
                      <th className="ch-lbl table-cell py-1 pr-3 font-normal">LINE</th>
                      <th className="ch-lbl table-cell py-1 pr-3 font-normal">QUESTION</th>
                      <th className="ch-lbl table-cell py-1 font-normal">PROBLEM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bad.slice(0, 100).map((r) => (
                      <tr key={r.line} className="border-t border-[rgba(110,74,42,.22)] align-top">
                        <td className="py-1 pr-3 font-mono">{r.line}</td>
                        <td className="py-1 pr-3">{r.text || <i>(empty)</i>}</td>
                        <td className="py-1 text-[#8E1B1B]">{r.errors.join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {bad.length > 100 && <p className="m-0 mt-1 text-sm">+ {bad.length - 100} more rows with problems</p>}
              <div className="mt-3 flex gap-2">
                <button type="button" className="ch-awax h-[44px] flex-1 rounded-[11px] text-base" disabled={busy || !report.valid.length} onClick={() => void run()}>
                  {busy ? `Importing… ${progress}/${report.valid.length}` : `Import ${report.valid.length} question${report.valid.length === 1 ? "" : "s"}`}
                </button>
                <button type="button" className="ch-plain h-[44px] rounded-[11px] px-4" disabled={busy} onClick={() => setReport(null)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
