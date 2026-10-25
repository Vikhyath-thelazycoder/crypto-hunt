import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { checkQuestion, csvTemplate, draftOf, emptyDraft, importQuestions, type QuestionDraft } from "./questions";

const mcq = (over: Partial<QuestionDraft> = {}): QuestionDraft => ({
  ...emptyDraft(),
  text: "Which keyword defines a function in Python?",
  format: "mcq",
  difficulty: "2",
  answer: "C",
  options: ["func", "function", "def", "lambda"],
  ...over,
});

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, commas and line breaks inside cells, BOM and CRLF", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"two\nlines",3')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "3"],
    ]);
  });
});

describe("checkQuestion (T-501)", () => {
  it("stores multiple choice with the answer as the option index", () => {
    const r = checkQuestion(mcq());
    expect(r).toEqual({
      ok: true,
      value: {
        text: "Which keyword defines a function in Python?",
        format: "mcq",
        options: ["func", "function", "def", "lambda"],
        answer: "2",
        alternatives: [],
        hint: null,
        difficulty: 2,
        category: null,
      },
    });
    if (!r.ok) throw new Error("expected a valid question");
    expect(draftOf(r.value).answer).toBe("C");
  });

  it("refuses multiple choice without four different options, a letter answer, or with a hint (D-029)", () => {
    const errs = (d: QuestionDraft) => (checkQuestion(d) as { errors: string[] }).errors.join(" ");
    expect(errs(mcq({ options: ["a", "b", "c", ""] }))).toMatch(/all four options/);
    expect(errs(mcq({ options: ["a", "b", "A", "d"] }))).toMatch(/all be different/);
    expect(errs(mcq({ answer: "E" }))).toMatch(/A, B, C or D/);
    expect(errs(mcq({ hint: "look up" }))).toMatch(/never gives a hint/);
  });

  it("typed answers: alternatives split on |, numbers must be numbers, no options", () => {
    const t = checkQuestion({ ...emptyDraft(), format: "text", text: "Capital of France?", answer: "Paris", alternatives: "paris city | PARIS " });
    expect(t.ok && t.value.alternatives).toEqual(["paris city", "PARIS"]);
    const n = checkQuestion({ ...emptyDraft(), format: "number", text: "2 + 2?", answer: "four" });
    expect(!n.ok && n.errors.join(" ")).toMatch(/must be digits/);
    const o = checkQuestion({ ...emptyDraft(), format: "text", text: "Colour?", answer: "red", options: ["x", "", "", ""] });
    expect(!o.ok && o.errors.join(" ")).toMatch(/only for multiple choice/);
  });

  it("checks length, difficulty and format", () => {
    const r = checkQuestion({ ...emptyDraft(), text: "Hi", difficulty: "6", format: "essay" });
    expect(!r.ok && r.errors).toEqual([
      "The question must be 3–600 characters.",
      "Difficulty must be a whole number from 1 to 5.",
      'Format must be "mcq", "text" or "number".',
    ]);
  });
});

describe("importQuestions", () => {
  it("the template imports cleanly: one of each format", () => {
    const r = importQuestions(csvTemplate());
    expect(r.problem).toBeNull();
    expect(r.valid.map((q) => q.format)).toEqual(["mcq", "text", "number"]);
    expect(r.rows.every((x) => x.errors.length === 0)).toBe(true);
  });

  it("reports every bad row by its line, refuses duplicates in the file and the bank, keeps the good ones", () => {
    const csv = [
      "Text,Format,Difficulty,Answer,Option A,Option B,Option C,Option D",
      "Largest ocean?,text,1,Pacific,,,,",
      "Largest ocean?,text,1,Pacific,,,,",
      "Bad one,mcq,9,Z,a,b,c,d",
      "Already here,text,2,yes,,,,",
    ].join("\n");
    const r = importQuestions(csv, ["already HERE"]);
    expect(r.valid).toHaveLength(1);
    expect(r.rows.map((x) => [x.line, x.errors.length > 0])).toEqual([
      [2, false],
      [3, true],
      [4, true],
      [5, true],
    ]);
    expect(r.rows[1]!.errors).toEqual(["Same question as line 2."]);
    expect(r.rows[2]!.errors.join(" ")).toMatch(/Difficulty.*A, B, C or D/);
    expect(r.rows[3]!.errors).toEqual(["Already in the bank."]);
  });

  it("names missing or unknown columns instead of guessing", () => {
    expect(importQuestions("text,answer\nx,y").problem).toBe("Missing columns: difficulty, format.");
    expect(importQuestions("difficulty,format,text,answer,colour\n1,text,abc,x,red").problem).toBe("Unknown column: colour.");
    expect(importQuestions("").problem).toBe("The file is empty.");
  });
});
