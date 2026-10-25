// Checks the seed question bank (T-502) with the app's own import rules (lib/admin/questions.ts), then its coverage:
// every format and both technical and other questions at each difficulty, and enough questions per difficulty
// for 10 crews with the default X (4 per crew per round, so crews in a round rarely share a question).
//
//   npm run check:questions [path]      (default supabase/seed/questions.csv)
import { readFileSync } from "node:fs";
import { importQuestions } from "../src/lib/admin/questions";
import { defaultAdvance, difficultyFor, MAX_DIFFICULTY, pyramidCounts } from "../src/lib/engine";

const path = process.argv[2] ?? "supabase/seed/questions.csv";
const report = importQuestions(readFileSync(path, "utf8"));
const problems: string[] = [];
if (report.problem) problems.push(report.problem);
for (const r of report.rows) if (r.errors.length) problems.push(`line ${r.line}: ${r.errors.join(" ")} (${r.text})`);

const TECH = new Set(["coding", "tech"]);
const teams = 10;
const counts = pyramidCounts(teams);
const advance = defaultAdvance(teams, counts.length);
const need = new Map<number, number>();
let inRound = teams;
counts.forEach((_, i) => {
  const d = difficultyFor(i + 1, counts.length);
  need.set(d, (need.get(d) ?? 0) + 4 * inRound);
  inRound = advance[i]!;
});

for (let d = 1; d <= MAX_DIFFICULTY; d++) {
  const at = report.valid.filter((q) => q.difficulty === d);
  for (const f of ["mcq", "text", "number"] as const)
    if (!at.some((q) => q.format === f)) problems.push(`difficulty ${d}: no ${f} question`);
  if (!at.some((q) => TECH.has(q.category ?? ""))) problems.push(`difficulty ${d}: no technical question`);
  if (!at.some((q) => !TECH.has(q.category ?? ""))) problems.push(`difficulty ${d}: no non-technical question`);
  const want = need.get(d) ?? 0;
  if (at.length < want) problems.push(`difficulty ${d}: ${at.length} questions, 10 crews need ${want}`);
  console.log(`difficulty ${d}: ${at.length} (10 crews need ${want})`);
}
if (report.valid.length < 300) problems.push(`only ${report.valid.length} questions; the bank needs at least 300`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  ✗ ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`\n✓ ${report.valid.length} questions, every row valid, every difficulty covered`);
