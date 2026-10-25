// CSV export of a hunt (F16): teams, members, round times, ranks, the ship's log and the admin audit, as one
// file with a section per table (opens as one sheet in Excel, Numbers or Google Sheets).
import type { ExportData } from "./api";

type Cell = string | number | boolean | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // A cell starting with = + - @ would run as a formula in a spreadsheet (CSV injection): prefix a quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

const json = (d: Record<string, unknown> | null | undefined) =>
  d && Object.keys(d).length ? JSON.stringify(d) : "";

export function exportCsv(x: ExportData): string {
  const maxRounds = Math.max(0, ...x.teams.flatMap((t) => t.rounds.map((r) => r.round)));
  const roundCols = Array.from({ length: maxRounds }, (_, i) => `Round ${i + 1} sealed at`);
  const rows: Cell[][] = [
    ["Crypto Hunt results"],
    ["Status", String(x.game?.status ?? ""), "Started", String(x.game?.started_at ?? ""), "Finished", String(x.game?.finished_at ?? "")],
    [],
    ["TEAMS"],
    ["Number", "Name", "Status", "Final rank", "Eliminated in round", "Members", "Rounds sealed", ...roundCols],
    ...x.teams.map((t) => {
      const byRound = new Map(t.rounds.map((r) => [r.round, `${r.completed_at} (#${r.order})`]));
      return [
        t.number,
        t.name,
        t.status,
        t.final_rank,
        t.eliminated_in_round,
        t.members.join("; "),
        t.rounds.length,
        ...Array.from({ length: maxRounds }, (_, i) => byRound.get(i + 1) ?? ""),
      ];
    }),
    [],
    ["SHIP'S LOG"],
    ["At", "Team", "Event", "Details"],
    ...x.events.map((e) => [e.at, e.team, e.kind, json(e.data)]),
    [],
    ["ADMIN AUDIT"],
    ["At", "Action", "Target", "Reason", "Details"],
    ...x.audit.map((a) => [a.at, a.action, a.target, a.reason, json(a.data)]),
  ];
  return toCsv(rows);
}

/**
 * Reads CSV text into rows (RFC 4180: quoted cells may hold commas, quotes as "" and line breaks). A leading BOM
 * and either line ending are accepted, so files saved by Excel, Numbers or Google Sheets all read the same.
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Saves text as a file in the browser. */
export function download(filename: string, text: string, type = "text/csv;charset=utf-8") {
  // BOM so Excel reads UTF-8 names (accents, emoji) correctly.
  const blob = new Blob(["﻿", text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportFilename = (now = new Date()) =>
  `crypto-hunt-${now.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
