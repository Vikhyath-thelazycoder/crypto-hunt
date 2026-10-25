import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QuestionRow } from "@/lib/admin/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/questions" }));

const api = vi.hoisted(() => {
  class AdminError extends Error {
    constructor(
      readonly code: string,
      readonly detail: string | null = null,
    ) {
      super(code);
    }
  }
  return {
    AdminError,
    signOutAdmin: vi.fn(),
    listQuestions: vi.fn(),
    getQuestion: vi.fn(),
    saveQuestion: vi.fn(),
    setQuestionEnabled: vi.fn(),
    deleteQuestion: vi.fn(),
    insertQuestions: vi.fn(),
  };
});
vi.mock("@/lib/admin/api", () => api);
vi.mock("@/lib/supabase/client", () => ({ getBrowserSupabase: () => ({}) }));

import { Questions } from "./Questions";

const row = (i: number, over: Partial<QuestionRow> = {}): QuestionRow => ({
  id: `q${i}`,
  text: `Question number ${i}?`,
  format: "text",
  difficulty: (i % 5) + 1,
  category: i % 2 ? "coding" : null,
  is_enabled: true,
  ...over,
});

beforeEach(() => {
  Object.values(api).forEach((f) => typeof f === "function" && "mockReset" in f && (f as ReturnType<typeof vi.fn>).mockReset());
});

describe("question bank page (T-501)", () => {
  it("lists the bank without answers and filters it", async () => {
    api.listQuestions.mockResolvedValue([row(1), row(2, { format: "mcq", text: "Pick the loop keyword?" }), row(3, { is_enabled: false })]);
    render(<Questions />);
    expect(await screen.findByText("Question number 1?")).toBeTruthy();
    expect(screen.getByText("2 enabled · 3 in the bank")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("SEARCH"), "loop");
    expect(screen.queryByText("Question number 1?")).toBeNull();
    expect(screen.getByText("Pick the loop keyword?")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("SEARCH"));
    await userEvent.selectOptions(screen.getByLabelText("STATE"), "off");
    expect(screen.getAllByRole("button", { name: /^Edit:/ }).map((b) => b.textContent)).toEqual([expect.stringContaining("Question number 3?")]);
  });

  it("the editor shows every problem before saving, then saves the checked question", async () => {
    api.listQuestions.mockResolvedValue([]);
    api.saveQuestion.mockResolvedValue(undefined);
    render(<Questions />);
    await userEvent.click(await screen.findByRole("button", { name: "New question" }));
    const dialog = screen.getByRole("dialog", { name: "New question" });
    await userEvent.type(within(dialog).getByLabelText("QUESTION"), "Which keyword defines a function in Python?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add question" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/all four options/);
    expect(api.saveQuestion).not.toHaveBeenCalled();
    for (const [L, v] of [["A", "func"], ["B", "function"], ["C", "def"], ["D", "lambda"]] as const)
      await userEvent.type(within(dialog).getByLabelText(`Option ${L}`), v);
    await userEvent.click(within(dialog).getByLabelText("C is right"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add question" }));
    await waitFor(() => expect(api.saveQuestion).toHaveBeenCalledTimes(1));
    expect(api.saveQuestion.mock.calls[0]).toEqual([
      null,
      expect.objectContaining({ format: "mcq", answer: "2", options: ["func", "function", "def", "lambda"], hint: null }),
    ]);
  });

  it("opening a question loads its answer once; a held question's refusal is explained", async () => {
    api.listQuestions.mockResolvedValue([row(1)]);
    api.getQuestion.mockResolvedValue({ text: "Question number 1?", format: "text", options: null, answer: "Paris", alternatives: ["paris"], hint: null, difficulty: 2, category: null });
    api.saveQuestion.mockRejectedValue(new api.AdminError("QUESTION_IN_USE"));
    render(<Questions />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit: Question number 1?" }));
    const answer = await screen.findByLabelText("ANSWER");
    expect((answer as HTMLInputElement).value).toBe("Paris");
    expect(api.getQuestion).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/answering this question right now/)).toBeTruthy();
  });

  it("CSV import: reports bad rows by line, imports only the good ones", async () => {
    api.listQuestions.mockResolvedValue([row(1, { text: "Already in the bank?" })]);
    api.insertQuestions.mockImplementation(async (qs: unknown[]) => qs.length);
    render(<Questions />);
    const csv = [
      "difficulty,format,text,answer",
      "1,text,Largest ocean?,Pacific",
      "9,text,Too hard?,x",
      "2,text,Already in the bank?,yes",
    ].join("\n");
    await userEvent.upload(await screen.findByLabelText("CSV file"), new File([csv], "bank.csv", { type: "text/csv" }));
    expect(await screen.findByText("1 ready")).toBeTruthy();
    const problems = screen.getByRole("table", { name: "Rows with problems" });
    expect(within(problems).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["3", "4"]);
    await userEvent.click(screen.getByRole("button", { name: "Import 1 question" }));
    await waitFor(() => expect(api.insertQuestions).toHaveBeenCalledTimes(1));
    expect(api.insertQuestions.mock.calls[0]![0]).toEqual([expect.objectContaining({ text: "Largest ocean?", answer: "Pacific" })]);
  });
});
