"""T-901 realistic load test, TEST project only. Unlike simulate.py on its own, every bot behaves like a real phone
while it plays: it holds a live Realtime connection and refetches when told to, runs the app's background checks, and
loads pages (each page load makes the site check the login with Supabase). The admin page and the projector are open.

    .venv/bin/python load.py --crews 43 --per-crew 4 --minutes 25 --label before-fixes

Pass or fail (T-1402): no server errors or timeouts, 95 % of actions under 1 s, no Supabase limit warnings (read from
the project's logs after the run).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import httpx
import websockets

import simulate
import world
from lib import ANON, ROOT, URL, Caller, RpcError, Service, join

WS_URL = URL.replace("https://", "wss://") + f"/realtime/v1/websocket?apikey={ANON}&vsn=1.0.0"
PLAYER_TABLES = [
    {"event": "*", "schema": "public", "table": "team_state"},
    {"event": "UPDATE", "schema": "public", "table": "public_state"},
]
ADMIN_TABLES = [
    {"event": "*", "schema": "public", "table": t}
    for t in ("events", "alerts", "teams", "players", "team_state", "round_results", "public_state")
]
SCREEN_TABLES = [{"event": "UPDATE", "schema": "public", "table": "public_state"}]


class Stats:
    def __init__(self) -> None:
        self.calls: list[tuple[str, float, int, float]] = []
        self.ws_up = 0
        self.ws_peak = 0
        self.ws_connects = 0
        self.ws_failures: Counter[str] = Counter()
        self.ws_messages = 0
        self.ws_bytes = 0
        self.ws_errors: Counter[str] = Counter()

    def note(self, fn: str, t0: float, status: int) -> None:
        self.calls.append((fn, time.perf_counter() - t0, status, time.time()))


class Socket:
    """A phone's Realtime connection (same channel config as src/hooks), reconnecting when it drops."""

    def __init__(self, stats: Stats, topic: str, tables: list[dict[str, str]], token: str | None, on_change, private: list[str] | None = None) -> None:  # type: ignore[no-untyped-def]
        self.stats, self.topic, self.tables, self.token, self.on_change, self.private = stats, topic, tables, token, on_change, private

    async def run(self) -> None:
        while True:
            try:
                await self._session()
            except asyncio.CancelledError:
                raise
            except Exception as e:  # noqa: BLE001
                self.stats.ws_failures[type(e).__name__] += 1
            await asyncio.sleep(random.uniform(1, 5))

    async def _session(self) -> None:
        async with websockets.connect(WS_URL, open_timeout=30, ping_interval=None) as ws:
            self.stats.ws_connects += 1
            self.stats.ws_up += 1
            self.stats.ws_peak = max(self.stats.ws_peak, self.stats.ws_up)
            try:
                for i, topic in enumerate(self.private if self.private is not None else [self.topic]):
                    await ws.send(json.dumps({
                        "topic": f"realtime:{topic}", "event": "phx_join", "ref": str(i + 1), "join_ref": str(i + 1),
                        "payload": {
                            "config": {"broadcast": {"ack": False, "self": False}, "presence": {"key": ""},
                                       "postgres_changes": self.tables, "private": self.private is not None},
                            "access_token": self.token or ANON,
                        },
                    }))
                beat = asyncio.create_task(self._heartbeat(ws))
                try:
                    async for raw in ws:
                        self.stats.ws_messages += 1
                        self.stats.ws_bytes += len(raw)
                        m = json.loads(raw)
                        if m.get("event") == "postgres_changes":
                            self.on_change(m["payload"].get("data", {}).get("table"))
                        elif m.get("event") == "broadcast":
                            self.on_change(m.get("topic", ""))
                        elif m.get("event") == "phx_reply" and m.get("payload", {}).get("status") == "error":
                            self.stats.ws_errors[str(m["payload"].get("response"))[:100]] += 1
                        elif m.get("event") == "system" and m.get("payload", {}).get("status") == "error":
                            self.stats.ws_errors[str(m["payload"].get("message"))[:100]] += 1
                finally:
                    beat.cancel()
            finally:
                self.stats.ws_up -= 1

    async def _heartbeat(self, ws) -> None:  # type: ignore[no-untyped-def]
        ref = 100
        while True:
            await asyncio.sleep(25)
            ref += 1
            await ws.send(json.dumps({"topic": "phoenix", "event": "heartbeat", "payload": {}, "ref": str(ref)}))


class Phone:
    """What usePlayer + the site do on one phone, around the crew's play. The numbers mirror the current code."""

    def __init__(self, caller: Caller, stats: Stats, poll_s: float, page_every_s: float) -> None:
        self.c, self.stats, self.poll_s, self.page_every_s = caller, stats, poll_s, page_every_s
        self.timer: asyncio.Task[None] | None = None

    async def status(self) -> None:
        try:
            await self.c.rpc("my_status")
        except (RpcError, Exception):  # noqa: BLE001
            pass

    def soon(self, source: str | None = None) -> None:
        if self.timer and not self.timer.done():
            self.timer.cancel()
        spread = random.uniform(0, 3) if source == "realtime:game" else 0.15
        self.timer = asyncio.create_task(self._later(spread))

    async def _later(self, delay: float) -> None:
        await asyncio.sleep(delay)
        await self.status()

    async def poll(self) -> None:
        await asyncio.sleep(random.uniform(0, self.poll_s))
        while True:
            self.soon()
            await asyncio.sleep(self.poll_s)

    async def pages(self) -> None:
        """A page load: the site's middleware checks the login with Supabase Auth, then the page reads public_state."""
        await asyncio.sleep(random.uniform(0, self.page_every_s))
        while True:
            t0 = time.perf_counter()
            try:
                r = await self.c.client.get(f"{URL}/auth/v1/user", headers=self.c.headers())
                self.stats.note("page: auth check", t0, r.status_code)
            except Exception:  # noqa: BLE001
                self.stats.note("page: auth check", t0, 0)
            t0 = time.perf_counter()
            try:
                r = await self.c.get("public_state", "select=data")
                self.stats.note("page: public_state", t0, r.status_code)
            except Exception:  # noqa: BLE001
                self.stats.note("page: public_state", t0, 0)
            await asyncio.sleep(random.uniform(0.5, 1.5) * self.page_every_s)


class LoadRun(simulate.Run):
    """The bots' game, but a server failure makes a crew wait and try again, as people do, instead of giving up."""

    async def call(self, crew, bot, fn, args=None):  # type: ignore[no-untyped-def]
        before = len(bot.caller.calls)
        try:
            r = await super().call(crew, bot, fn, args)
        except Exception:  # noqa: BLE001
            await asyncio.sleep(3)
            return None
        last = bot.caller.calls[before:]
        if r is None and last and last[-1][2] >= 500:
            await asyncio.sleep(3)
        return r

    def problem(self, what: str, **kw: Any) -> None:
        if kw.get("status", 0) >= 500:
            return  # counted as a server error in the stats
        super().problem(what, **kw)

    async def play(self, crew) -> None:  # type: ignore[no-untyped-def]
        while not self.done.is_set():
            try:
                await self._play(crew)
                return
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                await asyncio.sleep(3)


async def admin_page(admin: Caller, stats: Stats, a: argparse.Namespace) -> None:
    """The admin dashboard: Realtime on 7 tables and a 10 s check, each reloading the snapshot, limited as in the hook."""
    if not a.old_app:
        while True:
            await asyncio.sleep(5)
            try:
                await admin.rpc("admin_snapshot")
            except Exception:  # noqa: BLE001
                pass
    pending = asyncio.Event()
    sock = asyncio.create_task(Socket(stats, "admin", ADMIN_TABLES, admin.token, lambda _t: pending.set()).run())

    async def tick() -> None:
        while True:
            await asyncio.sleep(10)
            pending.set()

    timer = asyncio.create_task(tick())
    try:
        while True:
            await pending.wait()
            pending.clear()
            await asyncio.sleep(0.25)
            try:
                await admin.rpc("admin_snapshot")
            except Exception:  # noqa: BLE001
                pass
    finally:
        sock.cancel()
        timer.cancel()


async def projector(client, stats: Stats, a: argparse.Namespace) -> None:  # type: ignore[no-untyped-def]
    caller = Caller(client)
    sock = asyncio.create_task(Socket(stats, "screen", SCREEN_TABLES, None, lambda _t: None).run()) if a.old_app else None
    try:
        while True:
            await asyncio.sleep(10 if a.old_app else 5)
            t0 = time.perf_counter()
            try:
                r = await caller.get("public_state", "select=data,event_seq")
                stats.note("projector: public_state", t0, r.status_code)
            except Exception:  # noqa: BLE001
                stats.note("projector: public_state", t0, 0)
    finally:
        if sock:
            sock.cancel()


def pct(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    return values[min(len(values) - 1, int(len(values) * q))]


def report(calls: list[tuple[str, float, int, float]], t0: float) -> dict[str, Any]:
    by_fn: dict[str, list[tuple[str, float, int, float]]] = defaultdict(list)
    by_min: dict[int, list[tuple[str, float, int, float]]] = defaultdict(list)
    for c in calls:
        by_fn[c[0]].append(c)
        by_min[int((c[3] - t0) // 60)].append(c)
    bad = lambda rows: sum(1 for r in rows if r[2] >= 500 or r[2] == 0)  # noqa: E731
    return {
        "calls": len(calls),
        "server_errors": bad(calls),
        "p50_ms": round(pct([c[1] for c in calls], 0.5) * 1000),
        "p95_ms": round(pct([c[1] for c in calls], 0.95) * 1000),
        "by_function": {
            fn: {"calls": len(r), "errors": bad(r), "p50_ms": round(pct([x[1] for x in r], 0.5) * 1000), "p95_ms": round(pct([x[1] for x in r], 0.95) * 1000)}
            for fn, r in sorted(by_fn.items(), key=lambda kv: -len(kv[1]))
        },
        "by_minute": [
            {"min": m, "calls": len(r), "errors": bad(r), "p50_ms": round(pct([x[1] for x in r], 0.5) * 1000), "p95_ms": round(pct([x[1] for x in r], 0.95) * 1000)}
            for m, r in sorted(by_min.items())
        ],
    }


async def run(a: argparse.Namespace) -> dict[str, Any]:
    stats = Stats()
    started = time.time()
    limits = httpx.Limits(max_connections=a.crews * a.per_crew * 2 + 50, max_keepalive_connections=a.crews * a.per_crew)
    async with httpx.AsyncClient(timeout=60, limits=limits) as c:
        svc = Service(c)
        w = await world.build(c)
        admin: Caller = w["admin"]
        await admin.rpc("set_team_count", {"p_count": a.crews})
        rows = await svc.select("teams", "select=id,code,number&order=number")
        crews = [
            simulate.Crew(i, r["id"], r["code"], f"{simulate.CREW_NAMES[i % len(simulate.CREW_NAMES)]} {i}"[:24], simulate.personality(i, a.crews),
                          [simulate.Bot(f"{simulate.MEMBER_NAMES[(i + k) % len(simulate.MEMBER_NAMES)]} {k + 1}") for k in range(a.per_crew)])
            for i, r in enumerate(rows)
        ]

        # Joining spread over a couple of minutes, as at the event.
        async def join_bot(crew: simulate.Crew, bot: simulate.Bot) -> None:
            await asyncio.sleep(random.uniform(0, a.join_spread))
            for _ in range(25):
                try:
                    res = await join(c, bot.name, crew.code)
                except (httpx.TransportError, RpcError):
                    await asyncio.sleep(5)
                    continue
                if res.ok:
                    bot.caller = res.caller
                    return
                await asyncio.sleep(5)

        await asyncio.gather(*(join_bot(cr, b) for cr in crews for b in cr.bots))
        joined = sum(1 for cr in crews for b in cr.bots if b.caller)
        print(f"joined {joined}/{a.crews * a.per_crew} in {time.time() - started:.0f}s", flush=True)
        for cr in crews:
            caller = next((b.caller for b in cr.bots if b.caller), None)
            if caller:
                try:
                    await caller.rpc("name_crew", {"p_name": cr.name})
                except (httpx.TransportError, RpcError):
                    pass

        plan = await world.make_plan(svc, [cr.team_id for cr in crews], a.seed)
        await admin.rpc("apply_game_plan", {"p_plan": plan})

        background: list[asyncio.Task[None]] = []
        for cr in crews:
            for b in cr.bots:
                if not b.caller:
                    continue
                ph = Phone(b.caller, stats, a.poll, a.page_every)
                sock = (Socket(stats, "player", PLAYER_TABLES, ph.c.token, ph.soon) if a.old_app
                        else Socket(stats, "player", [], ph.c.token, ph.soon, [f"team:{cr.team_id}", "game"]))
                background.append(asyncio.create_task(sock.run()))
                background.append(asyncio.create_task(ph.poll()))
                if a.old_app:
                    background.append(asyncio.create_task(ph.pages()))
        background.append(asyncio.create_task(admin_page(admin, stats, a)))
        background.append(asyncio.create_task(projector(c, stats, a)))
        await asyncio.sleep(a.lobby)  # Phones sit in the lobby, connected, before Start.
        print(f"live connections before start: {stats.ws_up}", flush=True)

        await admin.rpc("start_game")
        sim = LoadRun(svc, admin, crews, a.seed, a.pace)
        sim.universal = (await svc.select("qr_codes", "select=token&kind=eq.universal"))[0]["token"]
        hunt0 = time.time()
        adm = asyncio.create_task(sim.admin_bot())

        async def progress() -> None:
            while True:
                await asyncio.sleep(30)
                calls = [x for cr in crews for b in cr.bots if b.caller for x in b.caller.calls] + stats.calls + admin.calls
                recent = [x for x in calls if x[3] > time.time() - 30]
                print(f"{(time.time() - hunt0) / 60:5.1f} min  {len(recent) * 2:5d} calls/min  p50 {pct([x[1] for x in recent], .5) * 1000:6.0f} ms  "
                      f"p95 {pct([x[1] for x in recent], .95) * 1000:6.0f} ms  errors {sum(1 for x in recent if x[2] >= 500 or x[2] == 0):4d}  live {stats.ws_up}", flush=True)
                g = (await svc.select("games", "select=status"))[0]
                if g["status"] == "FINISHED":
                    sim.done.set()
                    return

        prog = asyncio.create_task(progress())
        try:
            await asyncio.wait_for(asyncio.gather(*(sim.play(cr) for cr in crews)), timeout=a.minutes * 60)
            finished = True
        except TimeoutError:
            finished = False
        sim.done.set()
        for t in [*background, adm, prog]:
            t.cancel()
        await asyncio.gather(*background, adm, prog, return_exceptions=True)

        calls = [x for cr in crews for b in cr.bots if b.caller for x in b.caller.calls] + stats.calls + admin.calls
        out = {
            "label": a.label,
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(hunt0)),
            "ended_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "crews": a.crews,
            "phones": joined,
            "hunt_minutes": round((time.time() - hunt0) / 60, 1),
            "game_finished": finished,
            "realtime": {
                "peak_connections": stats.ws_peak, "connects": stats.ws_connects, "failed": dict(stats.ws_failures),
                "errors": dict(stats.ws_errors), "messages": stats.ws_messages, "megabytes": round(stats.ws_bytes / 1e6, 1),
            },
            "problems": sim.problems[:40],
            **report(calls, hunt0),
        }
        folder = ROOT / "docs" / "reports" / "runs" / f"load-{a.label}"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "summary.json").write_text(json.dumps(out, indent=2))
        return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--crews", type=int, default=43)
    ap.add_argument("--per-crew", type=int, default=4)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--pace", type=float, default=1.0)
    ap.add_argument("--minutes", type=float, default=25)
    ap.add_argument("--old-app", action="store_true", help="behave like the app that crashed on 2026-10-30")
    ap.add_argument("--poll", type=float, default=60, help="seconds between a phone's background checks (15 with --old-app)")
    ap.add_argument("--page-every", type=float, default=360, help="seconds between a phone's page loads")
    ap.add_argument("--join-spread", type=float, default=60)
    ap.add_argument("--lobby", type=float, default=30)
    ap.add_argument("--label", default="run")
    args = ap.parse_args()
    if args.old_app and args.poll == 60:
        args.poll = 15
    result = asyncio.run(run(args))
    print(json.dumps({k: v for k, v in result.items() if k not in ("by_minute", "problems")}, indent=2))
