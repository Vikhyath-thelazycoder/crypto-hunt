"""Shared plumbing for the bot tests (P8): talks to the TEST Supabase project exactly like a phone or the admin
console does (Edge Function join, one-time login, RPCs over PostgREST), plus a service-role reader for setup and
the rule checker. Refuses to run against production.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import string
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[2]


def _env() -> dict[str, str]:
    """TEST_* (and NEXT_PUBLIC_SUPABASE_URL, to refuse production) from .env.local, overridden by the process env."""
    out: dict[str, str] = {}
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    out.update({k: v for k, v in os.environ.items() if k.startswith(("TEST_", "NEXT_PUBLIC_"))})
    return out


ENV = _env()
URL = ENV.get("TEST_SUPABASE_URL", "").rstrip("/")
ANON = ENV.get("TEST_SUPABASE_ANON_KEY", "")
SERVICE = ENV.get("TEST_SUPABASE_SERVICE_ROLE_KEY", "")
if not (URL and ANON and SERVICE):
    raise SystemExit("TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY and TEST_SUPABASE_SERVICE_ROLE_KEY must be set in .env.local")
if URL == ENV.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/") or "vwkggtlrypmhlhifveob" in URL or "ccrjecfqezgyshquwytt" in URL:
    raise SystemExit("Refusing to run the bot tests against the production project")


def key_headers(key: str) -> dict[str, str]:
    """New-style keys go in `apikey` only; legacy JWT keys also as the bearer."""
    h = {"apikey": key}
    if key.startswith("eyJ"):
        h["Authorization"] = f"Bearer {key}"
    return h


class RpcError(Exception):
    def __init__(self, fn: str, message: str, status: int):
        super().__init__(f"{fn}: {message} ({status})")
        self.fn, self.message, self.status = fn, message, status


def http(timeout: float = 30) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout, limits=httpx.Limits(max_connections=200, max_keepalive_connections=100))


async def retry(send):  # type: ignore[no-untyped-def]
    """The event Wi-Fi drops connections now and then; so does a laptop. Retry transport errors a few times."""
    for attempt in range(5):
        try:
            return await send()
        except httpx.TransportError:
            if attempt == 4:
                raise
            await asyncio.sleep(0.5 * (attempt + 1))


# ── Service role (setup and reading back; never used by a bot to play) ──────────────────────────────
class Service:
    def __init__(self, client: httpx.AsyncClient):
        self.c = client
        self.h = {**key_headers(SERVICE), "Content-Type": "application/json"}

    async def select(self, table: str, query: str = "select=*") -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        start = 0
        while True:
            r = await retry(lambda: self.c.get(f"{URL}/rest/v1/{table}?{query}", headers={**self.h, "Range": f"{start}-{start + 999}"}))
            r.raise_for_status()
            page = r.json()
            out += page
            if len(page) < 1000:
                return out
            start += 1000

    async def insert(self, table: str, rows: list[dict[str, Any]] | dict[str, Any], upsert: bool = False) -> list[dict[str, Any]]:
        prefer = "return=representation" + (",resolution=merge-duplicates" if upsert else "")
        r = await retry(lambda: self.c.post(f"{URL}/rest/v1/{table}", headers={**self.h, "Prefer": prefer}, json=rows))
        if r.status_code >= 400:
            raise RuntimeError(f"insert {table}: {r.text}")
        return r.json()

    async def update(self, table: str, query: str, values: dict[str, Any]) -> None:
        r = await retry(lambda: self.c.patch(f"{URL}/rest/v1/{table}?{query}", headers=self.h, json=values))
        if r.status_code >= 400:
            raise RuntimeError(f"update {table}: {r.text}")

    async def delete(self, table: str, query: str) -> None:
        r = await retry(lambda: self.c.delete(f"{URL}/rest/v1/{table}?{query}", headers=self.h))
        if r.status_code >= 400:
            raise RuntimeError(f"delete {table}: {r.text}")

    async def create_user(self, email: str, password: str) -> str:
        r = await retry(lambda: self.c.post(
            f"{URL}/auth/v1/admin/users", headers=self.h, json={"email": email, "password": password, "email_confirm": True}
        ))
        if r.status_code >= 400:
            raise RuntimeError(f"create user: {r.text}")
        return r.json()["id"]

    async def delete_user(self, uid: str) -> None:
        await retry(lambda: self.c.delete(f"{URL}/auth/v1/admin/users/{uid}", headers=self.h))


# ── A signed-in caller (a player's phone or the admin console) ─────────────────────────────────────
@dataclass
class Caller:
    client: httpx.AsyncClient
    token: str | None = None
    refresh: str | None = None
    label: str = "anon"
    calls: list[tuple[str, float, int, float]] = field(default_factory=list)  # (fn, seconds, http status, when) for load stats

    def headers(self) -> dict[str, str]:
        h = {"apikey": ANON, "Content-Type": "application/json"}
        h["Authorization"] = f"Bearer {self.token}" if self.token else (f"Bearer {ANON}" if ANON.startswith("eyJ") else "")
        return {k: v for k, v in h.items() if v}

    async def rpc(self, fn: str, args: dict[str, Any] | None = None) -> Any:
        """Calls an RPC; raises RpcError on a raised SQL error (guard codes like NOT_REGISTERED, NOT_ADMIN)."""
        t0 = time.perf_counter()
        for attempt in range(4):
            try:
                r = await self.client.post(f"{URL}/rest/v1/rpc/{fn}", headers=self.headers(), json=args or {})
                break
            except httpx.TransportError:
                if attempt == 3:
                    self.calls.append((fn, time.perf_counter() - t0, 0, time.time()))
                    raise
                await asyncio.sleep(0.5 * (attempt + 1))
        self.calls.append((fn, time.perf_counter() - t0, r.status_code, time.time()))
        if r.status_code >= 400:
            try:
                body = r.json()
                msg = body.get("message") or json.dumps(body)
            except ValueError:
                msg = r.text
            raise RpcError(fn, msg, r.status_code)
        return r.json() if r.content else None

    async def get(self, table: str, query: str = "select=*") -> httpx.Response:
        return await self.client.get(f"{URL}/rest/v1/{table}?{query}", headers=self.headers())


async def sign_in(client: httpx.AsyncClient, email: str, password: str, label: str) -> Caller:
    for _ in range(30):
        r = await client.post(
            f"{URL}/auth/v1/token?grant_type=password",
            headers={"apikey": ANON, "Content-Type": "application/json"},
            json={"email": email, "password": password},
        )
        if r.status_code == 429:
            await asyncio.sleep(10)
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"sign in {label}: {r.text}")
        j = r.json()
        return Caller(client, j["access_token"], j["refresh_token"], label)
    raise RuntimeError(f"sign in {label}: rate limited")


@dataclass
class JoinResult:
    ok: bool
    code: str | None
    caller: Caller | None
    seconds: float
    http: int


async def join(
    client: httpx.AsyncClient, name: str, team_code: str, headers: dict[str, str] | None = None, extra: dict[str, Any] | None = None
) -> JoinResult:
    """What the Join screen does: the player-join function, then verify the one-time login, then claim the session."""
    t0 = time.perf_counter()
    try:
        r = await client.post(
            f"{URL}/functions/v1/player-join",
            headers={"apikey": ANON, "Content-Type": "application/json", **(headers or {})},
            json={"name": name, "team_code": team_code, **(extra or {})},
        )
    except httpx.TransportError as e:
        return JoinResult(False, f"TRANSPORT:{type(e).__name__}", None, time.perf_counter() - t0, 0)
    try:
        body = r.json()
    except ValueError:
        body = {"ok": False, "code": f"HTTP_{r.status_code}"}
    if not body.get("ok"):
        return JoinResult(False, body.get("code"), None, time.perf_counter() - t0, r.status_code)
    v = await client.post(
        f"{URL}/auth/v1/verify",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"type": "magiclink", "token_hash": body["token_hash"]},
    )
    if v.status_code >= 400:
        return JoinResult(False, f"VERIFY_{v.status_code}:{v.text[:120]}", None, time.perf_counter() - t0, v.status_code)
    s = v.json()
    caller = Caller(client, s["access_token"], s.get("refresh_token"), name)
    claim = await caller.rpc("claim_session", {"p_nonce": body["claim_nonce"]})
    if not claim.get("ok"):
        return JoinResult(False, claim.get("code"), None, time.perf_counter() - t0, 200)
    return JoinResult(True, None, caller, time.perf_counter() - t0, 200)


async def preview(client: httpx.AsyncClient, team_code: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    r = await client.post(
        f"{URL}/functions/v1/player-join",
        headers={"apikey": ANON, "Content-Type": "application/json", **(headers or {})},
        json={"team_code": team_code, "preview": True},
    )
    return r.json()


def rand(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def tsx(script: str, payload: Any) -> Any:
    """Runs a TypeScript helper (the app's own generator, parsers) with JSON in and out."""
    p = subprocess.run(
        ["npx", "tsx", script], input=json.dumps(payload), capture_output=True, text=True, cwd=ROOT, check=False
    )
    if p.returncode != 0:
        raise RuntimeError(f"{script}: {p.stderr[-2000:]}")
    return json.loads(p.stdout)


def ms(t: str | None) -> float | None:
    """ISO timestamp → epoch ms."""
    if not t:
        return None
    from datetime import datetime

    return datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp() * 1000
