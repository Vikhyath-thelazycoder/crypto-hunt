// The deployed player-join Edge Function end to end: one-time login, session claim, session move (T11).
import { beforeAll, describe, expect, it } from "vitest";
import {
  account,
  alerts,
  anon,
  call,
  getAdmin,
  join,
  raises,
  resetWorld,
  TEST_ANON_KEY,
  TEST_URL,
} from "./harness";

let code: string;

async function joinFn(name: string, team_code: string) {
  const res = await fetch(`${TEST_URL}/functions/v1/player-join`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: TEST_ANON_KEY },
    body: JSON.stringify({ name, team_code }),
  });
  return (await res.json()) as {
    ok: boolean;
    code?: string;
    token_hash?: string;
    claim_nonce?: string;
    team?: { name: string };
  };
}

/** What the phone does with the function's answer: verify the one-time login, then claim the session. */
async function phone(name: string, team_code: string) {
  const r = await joinFn(name, team_code);
  if (!r.ok) throw new Error(`join: ${r.code}`);
  const client = anon();
  const v = await client.auth.verifyOtp({ token_hash: r.token_hash!, type: "magiclink" });
  if (v.error) throw v.error;
  expect((await call(client, "claim_session", { p_nonce: r.claim_nonce })).ok).toBe(true);
  return client;
}

beforeAll(async () => {
  await resetWorld();
  const teams = await call<{ code: string }[]>((await getAdmin()).client, "create_teams", { p_count: 1 });
  code = teams[0]!.code;
});

describe("player-join", () => {
  it("previews a crew by code without creating an account", async () => {
    const res = await fetch(`${TEST_URL}/functions/v1/player-join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: TEST_ANON_KEY },
      body: JSON.stringify({ team_code: code, preview: true }),
    });
    const r = (await res.json()) as { ok: boolean; team?: { name: string; members: string[] } };
    expect(r.ok).toBe(true);
    expect(r.team!.members).toEqual([]);
    expect((await joinFn("x y", "ZZZZZZ")).code).toBe("BAD_CODE");
  });

  it("refuses bad input and unknown codes", async () => {
    expect((await joinFn("x", code)).code).toBe("BAD_NAME");
    expect((await joinFn("Ana Mate", "ZZZZZZ")).code).toBe("BAD_CODE");
  });

  it("joins with name + code and no password; the phone is signed in", async () => {
    const client = await phone("Ana Mate", code);
    const s = await call<{ ok: boolean; player: { name: string }; team: { name: string } }>(
      client,
      "my_status",
    );
    expect(s.player.name).toBe("Ana Mate");
  });

  it("a claim nonce works once only", async () => {
    const r = await joinFn("Ana Mate", code);
    const client = anon();
    await client.auth.verifyOtp({ token_hash: r.token_hash!, type: "magiclink" });
    expect((await call(client, "claim_session", { p_nonce: "wrong" })).code).toBe("BAD_CLAIM");
    expect((await call(client, "claim_session", { p_nonce: r.claim_nonce })).ok).toBe(true);
    expect((await call(client, "claim_session", { p_nonce: r.claim_nonce })).code).toBe("BAD_CLAIM");
  });

  it("joining again with the same name moves the session: the old phone is logged out, the admin alerted", async () => {
    const first = await phone("Ravi Mate", code);
    const second = await phone("ravi mate", code);
    expect(await raises(first, "my_status")).toBe("SESSION_MOVED");
    expect((await call<{ ok: boolean }>(second, "my_status")).ok).toBe(true);
    expect((await alerts("session_moved")).length).toBeGreaterThan(0);
  });

  it("the 4th member locks the team; a 5th is TEAM_FULL", async () => {
    await join(await account(30), "Meera Mate", code);
    await join(await account(31), "Josh Mate", code);
    expect((await joinFn("Fifth Mate", code)).code).toBe("TEAM_FULL");
  });
});
