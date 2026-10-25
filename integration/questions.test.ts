// The question bank (P5 · T-501): the captain adds, edits, turns off and deletes questions through the table API;
// players can't read or write the bank (answers live there); a question a player holds during the hunt can't be
// deleted or reworded (migration 0015), but turning it off still works.
import { beforeAll, describe, expect, it } from "vitest";
import { checkQuestion, emptyDraft } from "@/lib/admin/questions";
import { applyPlan, call, getAdmin, resetWorld, seedVenue, service, setupTeams, type Player } from "./harness";

let crew: Player[];
const admin = async () => (await getAdmin()).client;
const draft = (text: string) => {
  const r = checkQuestion({ ...emptyDraft(), format: "text", text, answer: "yes", difficulty: "1" });
  if (!r.ok) throw new Error(r.errors.join(" "));
  return r.value;
};

beforeAll(async () => {
  await resetWorld();
  const locations = await seedVenue(10, 40);
  const { teams, players } = await setupTeams(1);
  crew = players[0]!;
  await applyPlan(
    teams.map((t) => t.id),
    locations,
    { counts: [2, 1], advance: [1, 1] },
  );
});

describe("the captain edits the bank", () => {
  let id: string;

  it("adds a question checked by the same rules as the editor", async () => {
    const { data, error } = await (await admin()).from("questions").insert(draft("Is the sky blue on a clear day?")).select("id").single();
    expect(error).toBeNull();
    id = data!.id;
  });

  it("edits it, turns it off, deletes it", async () => {
    const a = await admin();
    expect((await a.from("questions").update({ text: "Is grass green?" }).eq("id", id)).error).toBeNull();
    expect((await a.from("questions").update({ is_enabled: false }).eq("id", id)).error).toBeNull();
    const { data } = await service.from("questions").select("text, is_enabled").eq("id", id).single();
    expect(data).toEqual({ text: "Is grass green?", is_enabled: false });
    expect((await a.from("questions").delete().eq("id", id)).error).toBeNull();
  });

  it("the database still refuses a broken multiple-choice row", async () => {
    const { error } = await (await admin())
      .from("questions")
      .insert({ text: "Three options only?", format: "mcq", options: ["a", "b", "c"], answer: "0", difficulty: 1 });
    expect(error?.message).toMatch(/check constraint/);
  });
});

describe("players can't touch the bank", () => {
  it("reads nothing and writes nothing", async () => {
    const p = crew[0]!.client;
    const { data } = await p.from("questions").select("id, answer").limit(5);
    expect(data ?? []).toEqual([]);
    const ins = await p.from("questions").insert(draft("Can a player sneak one in?"));
    expect(ins.error).not.toBeNull();
  });
});

describe("during the hunt (migration 0015)", () => {
  let held: string;

  beforeAll(async () => {
    await call(await admin(), "start_game");
    const { data } = await service.from("tasks").select("question_id").eq("team_id", crew[0]!.teamId).limit(1).single();
    held = data!.question_id;
  });

  it("a question a player holds can't be deleted or reworded", async () => {
    const a = await admin();
    expect((await a.from("questions").delete().eq("id", held)).error?.message).toMatch(/QUESTION_IN_USE/);
    expect((await a.from("questions").update({ answer: "changed" }).eq("id", held)).error?.message).toMatch(/QUESTION_IN_USE/);
  });

  it("but it can be turned off, and a free question can still be deleted", async () => {
    const a = await admin();
    expect((await a.from("questions").update({ is_enabled: false }).eq("id", held)).error).toBeNull();
    const { data: used } = await service.from("tasks").select("question_id");
    const inUse = new Set((used ?? []).map((t) => t.question_id));
    const { data: all } = await service.from("questions").select("id");
    const free = all!.find((q) => !inUse.has(q.id))!.id;
    expect((await a.from("questions").delete().eq("id", free)).error).toBeNull();
  });
});
