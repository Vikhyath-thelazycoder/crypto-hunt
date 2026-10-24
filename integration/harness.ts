// Integration harness: drives the real database on the crypto-hunt-test project (D-022). Never production.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { generatePlan, type GenerateInput } from "@/lib/generator";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY must be set in .env.local",
  );
}
if (
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  url.replace(/\/$/, "") === process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")
) {
  throw new Error("Refusing to run integration tests against the production project");
}

export const TEST_URL = url;
export const TEST_ANON_KEY = anonKey;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client: setup and assertions only (bypasses RLS). */
export const service = createClient(url, serviceKey, noSession);
export const anon = () => createClient(url, anonKey, noSession);

export type Actor = { client: SupabaseClient; userId: string };
export type Player = Actor & { playerId: string; name: string; teamId: string };

// ── Accounts ──────────────────────────────────────────────────────────────────────────────────────
// Auth rate-limits sign-ins per IP, so accounts are pooled: each signs in once per run and is reused by
// every test file (one module context: isolate: false). Their emails are not the join function's domain,
// so New Game never deletes them.
const pool: Actor[] = [];
let admin: Actor | null = null;

async function signedIn(label: string): Promise<Actor> {
  const email = `itest-${label}-${randomUUID().slice(0, 8)}@itest.cryptohunt.dev`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = anon();
  const until = Date.now() + 8 * 60_000;
  for (;;) {
    const { error: e } = await client.auth.signInWithPassword({ email, password });
    if (!e) break;
    if (!/rate limit/i.test(e.message) || Date.now() > until) throw e;
    await new Promise((r) => setTimeout(r, 20_000));
  }
  return { client, userId: data.user.id };
}

export async function getAdmin(): Promise<Actor> {
  if (!admin) {
    admin = await signedIn("admin");
    const { error } = await service
      .from("admins")
      .insert({ user_id: admin.userId, name: `Captain ${randomUUID().slice(0, 4)}` });
    if (error) throw error;
  }
  return admin;
}

/** The i-th pooled account (created on first use). */
export async function account(i: number): Promise<Actor> {
  while (pool.length <= i) pool.push(await signedIn(`p${pool.length}`));
  return pool[i]!;
}

// ── RPC helpers ──────────────────────────────────────────────────────────────────────────────────
export type Res = { ok: boolean; code?: string; [k: string]: unknown };

export async function call<T = Res>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data as T;
}

/** An RPC that must raise; returns the error message (the code). */
export async function raises(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const { error } = await client.rpc(fn, args);
  if (!error) throw new Error(`${fn} unexpectedly succeeded`);
  return error.message;
}

// ── World ────────────────────────────────────────────────────────────────────────────────────────
// Table → a never-null column, in delete order (children first).
const WIPE: [string, string][] = [
  ["scan_tickets", "player_id"],
  ["checkins", "player_id"],
  ["tasks", "id"],
  ["round_results", "team_id"],
  ["team_state", "team_id"],
  ["events", "id"],
  ["alerts", "id"],
  ["rate_limits", "subject"],
  ["assignments", "team_id"],
  ["qr_links", "from_qr"],
  ["qr_codes", "id"],
  ["rounds", "number"],
  ["players", "id"],
  ["teams", "id"],
  ["admin_audit", "id"],
  ["locations", "id"],
  ["questions", "id"],
];

/** Empties every game table on the test project and resets the game row. Keeps pooled accounts. */
export async function resetWorld() {
  for (const [t, col] of WIPE) {
    const { error } = await service.from(t).delete().not(col, "is", null);
    if (error) throw new Error(`wipe ${t}: ${error.message}`);
  }
  const { error } = await service
    .from("games")
    .update({
      status: "SETUP",
      registration_open: false,
      hints_enabled: false,
      paused_at: null,
      broadcast: null,
      broadcast_at: null,
      started_at: null,
      finished_at: null,
      end_reason: null,
    })
    .eq("id", 1);
  if (error) throw error;
}

/** Locations with recognisable clue pieces, and enough questions (answer = "ans <n>"). */
/** Locations, plus questions: typed (answer "Ans <n>") or, with `mcq`, multiple choice (D-029). */
export async function seedVenue(locations = 20, questions = 80, opts: { mcq?: boolean } = {}) {
  const locs = Array.from({ length: locations }, (_, i) => ({
    name: `Spot ${i + 1}`,
    map_x: 0.05 + (i % 10) * 0.09,
    map_y: 0.1 + Math.floor(i / 10) * 0.3,
    clue_pieces: [`spot${i + 1}-a`, `spot${i + 1}-b`, `spot${i + 1}-c`, `spot${i + 1}-d`],
    hint: `near spot ${i + 1}`,
  }));
  const { data: l, error: le } = await service.from("locations").insert(locs).select("id");
  if (le) throw le;
  const qs = Array.from({ length: questions }, (_, i) =>
    opts.mcq
      ? {
          text: `Choice question ${i + 1}?`,
          format: "mcq",
          options: ["North", "East", "South", "West"].map((d) => `${d} ${i + 1}`),
          answer: String(i % 4),
          hint: "never shown for multiple choice",
          difficulty: (i % 5) + 1,
        }
      : {
          text: `Question ${i + 1}?`,
          format: "text",
          answer: `Ans ${i + 1}`,
          alternatives: [`answer${i + 1}`],
          hint: `starts with A`,
          difficulty: (i % 5) + 1,
        },
  );
  const { error: qe } = await service.from("questions").insert(qs);
  if (qe) throw qe;
  return (l ?? []).map((x) => x.id as string);
}

/** Admin creates teams; each gets 4 pooled players who join through the real join RPCs. */
export async function setupTeams(teamCount: number, opts: { firstAccount?: number } = {}) {
  const adm = await getAdmin();
  const teams = await call<{ id: string; code: string; name: string }[]>(adm.client, "create_teams", {
    p_count: teamCount,
  });
  const players: Player[][] = [];
  let acc = opts.firstAccount ?? 0;
  for (const team of teams) {
    const crew: Player[] = [];
    for (let m = 0; m < 4; m++)
      crew.push(await join(await account(acc++), `${team.name.split(" ")[0]} ${m + 1}`, team.code));
    players.push(crew);
  }
  return { teams, players };
}

/** Same as the join Edge Function, minus the one-time login: commit, then the phone claims its session. */
export async function join(actor: Actor, name: string, code: string): Promise<Player> {
  const commit = await call(service, "join_commit", { p_user_id: actor.userId, p_name: name, p_code: code });
  if (!commit.ok) throw new Error(`join_commit: ${commit.code}`);
  const claim = await call(actor.client, "claim_session", { p_nonce: commit.claim_nonce });
  if (!claim.ok) throw new Error(`claim_session: ${claim.code}`);
  const { data } = await service.from("players").select("id, team_id").eq("user_id", actor.userId).single();
  return { ...actor, playerId: data!.id, teamId: data!.team_id, name };
}

export async function applyPlan(
  teamIds: string[],
  locationIds: string[],
  overrides: Partial<GenerateInput> = {},
) {
  const plan = generatePlan({ teamIds, locationIds, seed: 4242, ...overrides });
  await call(await getAdmin().then((a) => a.client), "apply_game_plan", { p_plan: plan });
  return plan;
}

// ── Reading secrets as the test (service role) ───────────────────────────────────────────────────
export async function qrFor(teamId: string, round: number) {
  const { data, error } = await service
    .from("assignments")
    .select("qr_codes(id, token, key, label, kind)")
    .eq("team_id", teamId)
    .eq("round", round)
    .single();
  if (error) throw error;
  return data.qr_codes as unknown as { id: string; token: string; key: string; label: string; kind: string };
}

export async function qrByLabel(label: string) {
  const { data, error } = await service
    .from("qr_codes")
    .select("id, token, key, label, kind, round")
    .eq("label", label)
    .single();
  if (error) throw error;
  return data as {
    id: string;
    token: string;
    key: string;
    label: string;
    kind: string;
    round: number | null;
  };
}

export async function universalToken() {
  return (await qrByLabel("U")).token;
}

/** The right answer as the player would give it: the typed answer, or the letter index they were shown. */
export async function answerFor(taskId: string) {
  const { data, error } = await service
    .from("tasks")
    .select("option_order, questions(answer, format)")
    .eq("id", taskId)
    .single();
  if (error) throw error;
  const q = data.questions as unknown as { answer: string; format: string };
  if (q.format !== "mcq") return q.answer;
  return String((data.option_order as number[]).indexOf(Number(q.answer)));
}

/** A shown letter index that is wrong for this player. */
export async function wrongChoiceFor(taskId: string) {
  return String((Number(await answerFor(taskId)) + 1) % 4);
}

export type Status = {
  ok: boolean;
  phase: string;
  round: { number: number; total: number; is_final: boolean } | null;
  task: { id: string; opened: boolean; solved: boolean; text: string | null } | null;
  pieces: { index: number; solved: boolean; text: string | null }[];
  seal_code: string | null;
  team: { status: string; final_rank: number | null; completion_key: string | null };
  region: { x: number; y: number; r: number } | null;
  [k: string]: unknown;
};

export const status = (p: Actor) => call<Status>(p.client, "my_status");

/** All four members solve their questions for the team's current round (round 1: scan the universal QR first). */
export async function solveAll(crew: Player[]) {
  for (const p of crew) {
    const s = await status(p);
    if (s.round?.number === 1 && !s.task?.opened) {
      const r = await call(p.client, "scan_qr", { p_token: await universalToken() });
      if (r.result !== "QUESTION") throw new Error(`universal scan: ${JSON.stringify(r)}`);
    }
    const task = (await status(p)).task!;
    if (task.solved) continue;
    const r = await call(p.client, "submit_answer", {
      p_task_id: task.id,
      p_answer: await answerFor(task.id),
    });
    if (!r.correct) throw new Error(`answer rejected: ${JSON.stringify(r)}`);
  }
}

/** All four members scan the team's own QR and type its key (and the seal code at the final mark). */
export async function checkInAll(crew: Player[]) {
  const s = await status(crew[0]!);
  const qr = await qrFor(crew[0]!.teamId, s.round!.number);
  let last: Res = { ok: false };
  for (const p of crew) {
    const scan = await call(p.client, "scan_qr", { p_token: qr.token });
    if (scan.code === "ALREADY_CHECKED_IN") continue;
    if (!scan.ok) throw new Error(`scan: ${JSON.stringify(scan)}`);
    last = await call(p.client, "submit_key", { p_token: qr.token, p_key: qr.key, p_seal_code: s.seal_code });
    if (!last.ok) throw new Error(`key: ${JSON.stringify(last)}`);
  }
  return last;
}

export async function playRound(crew: Player[]) {
  await solveAll(crew);
  return checkInAll(crew);
}

export async function alerts(kind: string) {
  const { data, error } = await service.from("alerts").select("*").eq("kind", kind).order("id");
  if (error) throw error;
  return data;
}

/** Deletes auth accounts created by this run (pool, admin, join-function users). */
export async function cleanupAccounts() {
  for (let page = 1; page < 20; page++) {
    const { data } = await service.auth.admin.listUsers({ page, perPage: 200 });
    const mine = (data?.users ?? []).filter(
      (u) => u.email?.endsWith("@itest.cryptohunt.dev") || u.email?.endsWith("@players.cryptohunt.app"),
    );
    for (const u of mine) await service.auth.admin.deleteUser(u.id);
    if (!data || data.users.length < 200) break;
  }
}
