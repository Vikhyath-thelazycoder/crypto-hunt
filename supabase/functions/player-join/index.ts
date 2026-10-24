// Player join (D-005, F1). Input: { name, team_code }. Output: { ok, token_hash, claim_nonce, team } or { ok: false, code }.
//
// The phone never gets a password. This function creates (or reuses) a pre-confirmed account, hands back a
// one-time login token (no email is sent), and the phone verifies it and claims its session with the nonce.
// Rejoining with the same name + code moves the session to the new phone and alerts the admin (T11).
// The service-role key is injected by Supabase and never leaves this function.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const EMAIL_DOMAIN = "players.cryptohunt.app";
const NAME = /^[\p{L}\p{N} .'_-]{2,40}$/u;
const CODE = /^[A-HJ-NP-Z2-9]{6}$/;

// CORS is not a security boundary: anyone can call this outside a browser. It only creates pre-confirmed
// accounts for valid team codes, rate-limited per IP in SQL.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Rpc = { ok: boolean; code?: string; user_id?: string | null; takeover?: boolean; claim_nonce?: string; team?: unknown };

async function rpc(fn: string, args: Record<string, unknown>): Promise<Rpc> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as Rpc;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);

  let body: { name?: unknown; team_code?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: "VALIDATION" }, 422);
  }
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const code = typeof body.team_code === "string" ? body.team_code.trim().toUpperCase() : "";
  if (!NAME.test(name)) return json({ ok: false, code: "BAD_NAME" }, 422);
  if (!CODE.test(code)) return json({ ok: false, code: "BAD_CODE" }, 422);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";

  try {
    const pre = await rpc("join_preflight", { p_name: name, p_code: code, p_ip: ip });
    if (!pre.ok) return json({ ok: false, code: pre.code }, 409);

    let userId = pre.user_id ?? null;
    let email: string;
    let created = false;
    if (userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user?.email) throw new Error("existing player has no account");
      email = data.user.email;
    } else {
      email = `${crypto.randomUUID()}@${EMAIL_DOMAIN}`;
      const password = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`createUser: ${error?.code ?? "no user"}`);
      userId = data.user.id;
      created = true;
    }

    const commit = await rpc("join_commit", { p_user_id: userId, p_name: name, p_code: code });
    if (!commit.ok) {
      if (created) await admin.auth.admin.deleteUser(userId);
      return json({ ok: false, code: commit.code }, 409);
    }

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw new Error(`generateLink: ${link.error.code ?? link.error.message}`);
    return json({ ok: true, token_hash: link.data.properties.hashed_token, claim_nonce: commit.claim_nonce, team: commit.team });
  } catch (e) {
    console.error("player-join failed", e instanceof Error ? e.message : e);
    return json({ ok: false, code: "SERVER" }, 500);
  }
});
