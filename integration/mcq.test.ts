// D-029: multiple choice — 4 options shuffled per player, a wrong tap swaps the question, never a hint.
import { beforeAll, describe, expect, it } from "vitest";
import {
  answerFor,
  raises,
  applyPlan,
  call,
  getAdmin,
  resetWorld,
  seedVenue,
  service,
  setupTeams,
  status,
  universalToken,
  wrongChoiceFor,
  type Player,
} from "./harness";

let crew: Player[];

type McqStatus = {
  task: { id: string; format: string; options: string[]; has_hint: boolean; solved: boolean; text: string };
  pieces: { solved: boolean }[];
};
const mine = async (p: Player) => (await status(p)) as unknown as McqStatus;

beforeAll(async () => {
  await resetWorld();
  const locations = await seedVenue(20, 60, { mcq: true });
  const { teams, players } = await setupTeams(1);
  crew = players[0]!;
  await applyPlan([teams[0]!.id], locations, { counts: [2, 1], advance: [1, 1] });
  await call((await getAdmin()).client, "start_game");
  await call((await getAdmin()).client, "set_hints", { p_enabled: true });
  for (const p of crew) await call(p.client, "scan_qr", { p_token: await universalToken() });
});

describe("multiple choice (D-029)", () => {
  it("shows exactly 4 options, in each player's own shuffled order", async () => {
    let shuffled = 0;
    for (const p of crew) {
      const s = await mine(p);
      expect(s.task.format).toBe("mcq");
      const { data } = await service
        .from("tasks")
        .select("option_order, questions(options)")
        .eq("id", s.task.id)
        .single();
      const original = (data!.questions as unknown as { options: string[] }).options;
      const order = data!.option_order as number[];
      expect([...order].sort()).toEqual([0, 1, 2, 3]);
      expect(s.task.options).toEqual(order.map((i) => original[i]));
      if (order.join() !== "0,1,2,3") shuffled++;
    }
    expect(shuffled).toBeGreaterThan(0); // all four unshuffled has odds of 1 in 331,776
  });

  it("never offers a hint, even with hints switched on", async () => {
    const s = await mine(crew[0]!);
    expect(s.task.has_hint).toBe(false);
    expect((await call(crew[0]!.client, "use_hint", { p_task_id: s.task.id })).code).toBe("NO_HINT");
  });

  it("a wrong tap swaps in a different question at once; no piece, no second try", async () => {
    const p = crew[1]!;
    const before = await mine(p);
    const r = await call(p.client, "submit_answer", {
      p_task_id: before.task.id,
      p_answer: await wrongChoiceFor(before.task.id),
    });
    expect(r).toMatchObject({ ok: true, correct: false, replaced: true });
    const after = await mine(p);
    expect(after.task.id).toBe(before.task.id);
    expect(after.task.text).not.toBe(before.task.text);
    expect(after.task.solved).toBe(false);
    expect(after.pieces.filter((x) => x.solved)).toHaveLength(0);
    const { data } = await service
      .from("tasks")
      .select("replaced_questions, question_id")
      .eq("id", before.task.id)
      .single();
    expect(data!.replaced_questions).toHaveLength(1);
    expect(data!.replaced_questions).not.toContain(data!.question_id);
  });

  it("a swapped-out question never comes back to the crew", async () => {
    const p = crew[1]!;
    for (let i = 0; i < 4; i++) {
      const s = await mine(p);
      await call(p.client, "submit_answer", {
        p_task_id: s.task.id,
        p_answer: await wrongChoiceFor(s.task.id),
      });
    }
    const { data: tasks } = await service
      .from("tasks")
      .select("question_id, replaced_questions")
      .eq("team_id", p.teamId);
    const seen = tasks!
      .flatMap((t) => [t.question_id, ...(t.replaced_questions as string[])])
      .filter(Boolean);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("the right letter for this player's order unlocks the piece", async () => {
    const p = crew[2]!;
    const s = await mine(p);
    const r = await call(p.client, "submit_answer", {
      p_task_id: s.task.id,
      p_answer: await answerFor(s.task.id),
    });
    expect(r).toMatchObject({ ok: true, correct: true, pieces: 1 });
  });

  it("refuses an answer that isn't a choice", async () => {
    const s = await mine(crew[3]!);
    expect((await call(crew[3]!.client, "submit_answer", { p_task_id: s.task.id, p_answer: "Z" })).code).toBe(
      "BAD_ANSWER",
    );
  });

  it("a multiple-choice question must have exactly 4 options", async () => {
    const { error } = await service.from("questions").insert({
      text: "Three options?",
      format: "mcq",
      options: ["a", "b", "c"],
      answer: "0",
      difficulty: 1,
    });
    expect(error?.message).toMatch(/questions_mcq_four/);
  });

  describe("every 3rd wrong adds a minute to the crew's penalty (D-041)", () => {
    const wrong = async (p: Player) => {
      const s = await mine(p);
      return call(p.client, "submit_answer", {
        p_task_id: s.task.id,
        p_answer: await wrongChoiceFor(s.task.id),
      });
    };
    const penalty = async (p: Player) =>
      (await service.from("team_state").select("penalty_ms").eq("team_id", p.teamId).single()).data!
        .penalty_ms as number;

    it("counts misses, then adds 1:00 on the third and restarts the count; nobody is locked out", async () => {
      const p = crew[3]!;
      const before = await penalty(p);
      expect(await wrong(p)).toMatchObject({ replaced: true, strikes: 1, penalized: false });
      expect(await wrong(p)).toMatchObject({ replaced: true, strikes: 2, penalized: false });
      expect(await wrong(p)).toMatchObject({
        replaced: true,
        strikes: 0,
        penalized: true,
        penalty_ms: before + 60000,
      });
      expect(await penalty(p)).toBe(before + 60000);
      expect(await wrong(p)).toMatchObject({ strikes: 1, penalized: false });
      expect((await status(p)) as unknown as { task: { strikes: number } }).toMatchObject({
        task: { strikes: 1 },
      });
    });

    it("the right pick still unlocks the piece straight after", async () => {
      const p = crew[3]!;
      const s = await mine(p);
      const r = await call(p.client, "submit_answer", {
        p_task_id: s.task.id,
        p_answer: await answerFor(s.task.id),
      });
      expect(r).toMatchObject({ ok: true, correct: true });
    });

    it("the lockout setting is gone", async () => {
      expect(await raises((await getAdmin()).client, "set_mcq_lockout", { p_ms: 120000 })).toMatch(
        /set_mcq_lockout|function/,
      );
    });
  });
});
