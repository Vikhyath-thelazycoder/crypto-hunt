// The question bank's rules (F18, T-501): one checker for the editor, the CSV import and the seed-bank validator,
// mirroring the database's checks (questions table, questions_mcq_four, D-029) so the captain sees every problem
// before anything is sent.
import { MAX_DIFFICULTY } from "@/lib/engine";
import { parseCsv } from "./csv";

export type Format = "mcq" | "text" | "number";

/** A question as stored (the shape the `questions` table takes on insert). */
export type QuestionInput = {
  text: string;
  format: Format;
  options: string[] | null;
  /** mcq: the right option's index "0".."3"; text/number: the answer. */
  answer: string;
  alternatives: string[];
  hint: string | null;
  difficulty: number;
  category: string | null;
};

/** What the editor and a CSV row hold: everything as typed. */
export type QuestionDraft = {
  text: string;
  format: string;
  difficulty: string;
  /** mcq: A–D (or 1–4); text/number: the answer. */
  answer: string;
  /** Other accepted answers, separated by "|". */
  alternatives: string;
  options: [string, string, string, string];
  hint: string;
  category: string;
};

export const LETTERS = ["A", "B", "C", "D"] as const;
export const CSV_COLUMNS = [
  "difficulty",
  "format",
  "text",
  "answer",
  "alternatives",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "hint",
  "category",
] as const;

const NUMBER = /^-?[0-9]+(\.[0-9]+)?$/;
/** Same as the server's _norm, minus unaccent: enough to spot duplicates and empty answers. */
export const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export const emptyDraft = (): QuestionDraft => ({
  text: "",
  format: "mcq",
  difficulty: "1",
  answer: "",
  alternatives: "",
  options: ["", "", "", ""],
  hint: "",
  category: "",
});

export function draftOf(q: QuestionInput): QuestionDraft {
  return {
    text: q.text,
    format: q.format,
    difficulty: String(q.difficulty),
    answer: q.format === "mcq" ? (LETTERS[Number(q.answer)] ?? "") : q.answer,
    alternatives: q.alternatives.join(" | "),
    options: q.format === "mcq" && q.options ? [q.options[0] ?? "", q.options[1] ?? "", q.options[2] ?? "", q.options[3] ?? ""] : ["", "", "", ""],
    hint: q.hint ?? "",
    category: q.category ?? "",
  };
}

/** Checks a draft; returns the question to store, or every problem in plain words. */
export function checkQuestion(d: QuestionDraft): { ok: true; value: QuestionInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const text = d.text.trim();
  const format = d.format.trim().toLowerCase();
  const category = d.category.trim();
  const hint = d.hint.trim();
  if (text.length < 3 || text.length > 600) errors.push("The question must be 3–600 characters.");
  const difficulty = Number(d.difficulty.trim());
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > MAX_DIFFICULTY)
    errors.push(`Difficulty must be a whole number from 1 to ${MAX_DIFFICULTY}.`);
  if (category.length > 40) errors.push("Category: at most 40 characters.");
  if (hint.length > 300) errors.push("Hint: at most 300 characters.");

  let options: string[] | null = null;
  let answer = d.answer.trim();
  let alternatives = d.alternatives
    .split("|")
    .map((a) => a.trim())
    .filter(Boolean);

  if (format === "mcq") {
    options = d.options.map((o) => o.trim());
    if (options.some((o) => !o)) errors.push("Multiple choice needs all four options (A–D).");
    else if (new Set(options.map(norm)).size < 4) errors.push("The four options must all be different.");
    if (options.some((o) => o.length > 200)) errors.push("Each option: at most 200 characters.");
    const letter = answer.toUpperCase();
    const index = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
    const numeric = /^[1-4]$/.test(letter) ? Number(letter) - 1 : -1;
    const pick = index >= 0 ? index : numeric;
    if (pick < 0) errors.push("The answer to a multiple-choice question is the right option's letter: A, B, C or D.");
    answer = String(pick);
    if (alternatives.length) errors.push("Multiple choice has no other accepted answers.");
    if (hint) errors.push("Multiple choice never gives a hint (D-029): leave the hint empty.");
    alternatives = [];
  } else if (format === "text" || format === "number") {
    if (!norm(answer)) errors.push("Write the answer.");
    if (answer.length > 120) errors.push("Answer: at most 120 characters.");
    if (format === "number") {
      if (answer && !NUMBER.test(answer)) errors.push("A number answer must be digits, like 42 or 3.5.");
      for (const a of alternatives) if (!NUMBER.test(a)) errors.push(`"${a}" is not a number.`);
    }
    if (d.options.some((o) => o.trim())) errors.push("Options are only for multiple choice.");
  } else {
    errors.push('Format must be "mcq", "text" or "number".');
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      text,
      format: format as Format,
      options,
      answer,
      alternatives,
      hint: hint || null,
      difficulty,
      category: category || null,
    },
  };
}

export type ImportRow = { line: number; text: string; errors: string[] };
export type ImportReport = { valid: QuestionInput[]; rows: ImportRow[]; problem: string | null };

/**
 * Reads a question CSV (header row, columns in any order, see CSV_COLUMNS). Every row is checked; a row is also
 * refused when its question is already in the bank or appears twice in the file. Nothing is half-imported:
 * the caller stores `valid` and shows `rows` (every row, with its problems).
 */
export function importQuestions(csv: string, existingTexts: Iterable<string> = []): ImportReport {
  const table = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
  if (!table.length) return { valid: [], rows: [], problem: "The file is empty." };
  const header = table[0]!.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const missing = ["difficulty", "format", "text", "answer"].filter((c) => !header.includes(c));
  if (missing.length) return { valid: [], rows: [], problem: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` };
  const unknown = header.filter((h) => h && !(CSV_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) return { valid: [], rows: [], problem: `Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.` };

  const col = (row: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (row[i] ?? "") : "";
  };
  const seen = new Map<string, number>();
  const bank = new Set([...existingTexts].map(norm));
  const valid: QuestionInput[] = [];
  const rows: ImportRow[] = [];
  table.slice(1).forEach((row, i) => {
    const line = i + 2;
    const draft: QuestionDraft = {
      text: col(row, "text"),
      format: col(row, "format"),
      difficulty: col(row, "difficulty"),
      answer: col(row, "answer"),
      alternatives: col(row, "alternatives"),
      options: [col(row, "option_a"), col(row, "option_b"), col(row, "option_c"), col(row, "option_d")],
      hint: col(row, "hint"),
      category: col(row, "category"),
    };
    const r = checkQuestion(draft);
    const errors = r.ok ? [] : [...r.errors];
    const key = norm(draft.text);
    if (key && bank.has(key)) errors.push("Already in the bank.");
    else if (key && seen.has(key)) errors.push(`Same question as line ${seen.get(key)}.`);
    if (key && !seen.has(key)) seen.set(key, line);
    if (r.ok && !errors.length) valid.push(r.value);
    rows.push({ line, text: draft.text.trim(), errors });
  });
  return { valid, rows, problem: null };
}

/** A starter file: the header and one example of each format. */
export function csvTemplate(): string {
  return [
    CSV_COLUMNS.join(","),
    '1,mcq,"What does print(2 + 3 * 2) show in Python?",B,,10,8,12,7,,coding',
    "2,text,Which planet is called the Red Planet?,Mars,,,,,,Named after a Roman god,geography",
    '3,number,"How many times does for i in range(4): run its body?",4,,,,,,Count from zero,coding',
  ].join("\r\n");
}
