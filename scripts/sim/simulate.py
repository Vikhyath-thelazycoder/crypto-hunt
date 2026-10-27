"""T-801 bot simulation: 25 crews × 4 = 100 bot players on the real venue, TEST project only.

All 100 join in the same second from this machine's one IP (like the event Wi-Fi), the first member of each crew
names it, the admin bot builds the course with the app's own generator and starts, and the crews play the whole hunt
through the real RPCs until the top 3 finish and the game is over. Crews are given personalities so every rule gets
used: careful, guessers (typed and multiple-choice wrongs → wrong-answer penalties), hint takers, slow crews (to be
eliminated), a pair that seals at the same instant, prank chasers (prank QRs, a later round's QR, a later round's key).
The admin bot turns hints on, broadcasts, pauses and resumes, marks a member inactive, kicks one, re-points a crew and
lowers X live. Bots know where their marks are (they read their own assignment), they don't decode clues.

    .venv/bin/python simulate.py [--teams 25] [--seed 1] [--out DIR]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import time
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import world
from lib import Caller, RpcError, Service, http, join, ms

CREW_NAMES = [
    "Salt Wolves", "Black Tide", "Iron Gulls", "Night Herons", "Copper Owls", "Rust Anchors", "Ember Crows",
    "Grey Moths", "Pale Foxes", "Stone Eels", "Brass Kites", "Storm Petrels", "Red Lanterns", "Tin Compasses",
    "Amber Rays", "Ghost Crabs", "Jade Serpents", "Sea Ravens", "Dusk Otters", "Gold Finches", "Iron Keels",
    "Mist Walkers", "Coral Knights", "Wild Tides", "Ash Herons", "Cinder Sails", "Frost Wolves", "Hollow Reefs",
    "Moon Pikes", "North Stars",
]
MEMBER_NAMES = ["Ana", "Ravi", "Meera", "Josh", "Kiran", "Sam", "Leela", "Omar", "Dev", "Ira", "Noor", "Tom"]


def personality(i: int, teams: int) -> str:
    """Crew i's style. The slowest crews go last so a 25-crew run eliminates them in the first rounds."""
    plan = ["careful", "careful", "careful", "guesser", "guesser", "guesser", "hinter", "hinter", "hinter",
            "tie", "tie", "prankster", "prankster"]
    if i < len(plan) and i < teams - 2:
        return plan[i]
    return "slow" if i >= teams - max(2, teams // 4) else "medium"


@dataclass
class Bot:
    name: str
    caller: Caller | None = None
    gone: str | None = None  # "kicked" / "inactive" once the admin removes them


@dataclass
class Crew:
    index: int
    team_id: str
    code: str
    name: str
    style: str
    bots: list[Bot]
    log: list[dict[str, Any]] = field(default_factory=list)
    outcome: str = ""

    def active(self) -> list[Bot]:
        return [b for b in self.bots if b.caller and not b.gone]

    def note(self, what: str, **kw: Any) -> None:
        self.log.append({"t": round(time.time(), 3), "what": what, **kw})


class Run:
    def __init__(self, svc: Service, admin: Caller, crews: list[Crew], seed: int, pace: float = 1.0):
        self.s, self.admin, self.crews, self.rand, self.pace = svc, admin, crews, random.Random(seed), pace
        self.used: Counter[str] = Counter()  # which rules/paths the run exercised
        self.problems: list[dict[str, Any]] = []  # anything a bot saw that the game should not do
        self.tie_gate: asyncio.Event = asyncio.Event()
        self.tie_ready: set[str] = set()
        self.universal = ""
        self.done = asyncio.Event()

    def problem(self, what: str, **kw: Any) -> None:
        self.problems.append({"t": round(time.time(), 3), "what": what, **kw})

    # ── reading as the test (bots know where their marks are; they never read a secret through the game) ──
    async def mark_for(self, team: str, rnd: int) -> dict[str, Any]:
        rows = await self.s.select("assignments", f"select=qr_codes(id,token,key,label,kind)&team_id=eq.{team}&round=eq.{rnd}")
        return rows[0]["qr_codes"]

    async def answer_for(self, task_id: str) -> str:
        row = (await self.s.select("tasks", f"select=option_order,questions(answer,format)&id=eq.{task_id}"))[0]
        q = row["questions"]
        return q["answer"] if q["format"] != "mcq" else str(row["option_order"].index(int(q["answer"])))

    # ── playing ─────────────────────────────────────────────────────────────────────────────────────
    async def think(self, lo: float, hi: float) -> None:
        await asyncio.sleep(self.rand.uniform(lo, hi) * self.pace)

    async def pause_point(self) -> None:
        """Short human-like delay."""
        await asyncio.sleep(self.rand.uniform(0.3, 1.5))

    async def call(self, crew: Crew, bot: Bot, fn: str, args: dict[str, Any] | None = None) -> dict[str, Any] | None:
        """A bot's RPC. Guard errors that mean "you're out" retire the bot; PAUSED waits and retries."""
        assert bot.caller
        for _ in range(240):
            try:
                r = await bot.caller.rpc(fn, args)
            except RpcError as e:
                if e.message in ("NOT_REGISTERED", "SESSION_MOVED"):
                    bot.gone = bot.gone or "kicked"
                    crew.note("bot retired", bot=bot.name, why=e.message)
                    return None
                self.problem("unexpected RPC error", crew=crew.name, bot=bot.name, fn=fn, error=e.message, status=e.status)
                return None
            if isinstance(r, dict) and r.get("code") == "PAUSED":
                # A phone shows the pause screen and waits for the resume (it refreshes every few seconds).
                self.used["paused refusal"] += 1
                await asyncio.sleep(4)
                continue
            if isinstance(r, dict) and r.get("code") == "INACTIVE":
                bot.gone = "inactive"
                crew.note("bot inactive", bot=bot.name)
                return None
            if isinstance(r, dict) and r.get("code") == "RATE_LIMITED":
                self.used["rate limited (bot)"] += 1
                await asyncio.sleep(6)
                continue
            return r
        self.problem("paused for over 4 minutes", crew=crew.name, fn=fn)
        return None

    async def solve(self, crew: Crew, bot: Bot, rnd: int) -> None:
        st = await self.call(crew, bot, "my_status")
        if not st or not st.get("task"):
            return
        task = st["task"]
        if task.get("solved"):
            return
        if rnd == 1 and not task.get("opened"):
            r = await self.call(crew, bot, "scan_qr", {"p_token": self.universal})
            if r and r.get("result") != "QUESTION":
                self.problem("universal scan did not open the question", crew=crew.name, reply=r)
            st = await self.call(crew, bot, "my_status")
            if not st or not st.get("task"):
                return
            task = st["task"]
        style = crew.style
        # Thinking time, like people reading and working out a question (scaled by --pace).
        await self.think(*{"slow": (45, 80), "medium": (12, 30), "guesser": (8, 20), "hinter": (10, 25)}.get(style, (6, 15)))

        # Wrong answers: guessers miss three times (a penalty minute); mediums sometimes miss once.
        misses = 3 if style == "guesser" else (1 if style == "medium" and self.rand.random() < 0.3 else 0)
        for k in range(misses):
            if task["format"] == "mcq":
                right = int(await self.answer_for(task["id"]))
                r = await self.call(crew, bot, "submit_answer", {"p_task_id": task["id"], "p_answer": str((right + 1) % 4)})
                if r and r.get("correct") is False:
                    self.used["wrong multiple choice (swapped)"] += 1
                    if not r.get("replaced"):
                        self.problem("wrong multiple-choice pick did not swap the question", crew=crew.name)
                st = await self.call(crew, bot, "my_status")
                if not st or not st.get("task"):
                    return
                task = st["task"]
            else:
                r = await self.call(crew, bot, "submit_answer", {"p_task_id": task["id"], "p_answer": f"no idea {k}"})
                if r and r.get("correct") is False:
                    self.used["wrong typed answer"] += 1
            if r and r.get("penalized"):
                self.used["wrong-answer penalty (3rd miss)"] += 1
        # Hints: hint takers take one whenever it's allowed (never on multiple choice).
        if style == "hinter" and task["format"] != "mcq" and task.get("has_hint"):
            r = await self.call(crew, bot, "use_hint", {"p_task_id": task["id"]})
            if r and r.get("ok"):
                self.used["hint (+1:00)"] += 1
            elif r and r.get("code") not in ("HINTS_OFF",):
                self.problem("hint refused", crew=crew.name, reply=r)
        if style == "hinter" and task["format"] == "mcq":
            r = await self.call(crew, bot, "use_hint", {"p_task_id": task["id"]})
            if r and r.get("ok"):
                self.problem("hint given on multiple choice", crew=crew.name)
            else:
                self.used["hint refused on multiple choice"] += 1
        r = await self.call(crew, bot, "submit_answer", {"p_task_id": task["id"], "p_answer": await self.answer_for(task["id"])})
        if r and not r.get("correct") and r.get("code") not in ("ALREADY_SOLVED", "ELIMINATED", "NOT_RUNNING"):
            self.problem("right answer refused", crew=crew.name, reply=r)

    async def check_in(self, crew: Crew, st: dict[str, Any]) -> None:
        rnd = st["round"]["number"]
        mark = await self.mark_for(crew.team_id, rnd)
        seal = st.get("seal_code")
        if crew.style == "prankster" and crew.log.count({"what": "pranked", "round": rnd}) == 0:
            await self.prank_tricks(crew, rnd)
        bots = crew.active()
        # Walking to the mark: slow crews wander.
        await self.think(*((35, 60) if crew.style == "slow" else (10, 25)))
        for i, bot in enumerate(bots):
            r = await self.call(crew, bot, "scan_qr", {"p_token": mark["token"]})
            if not r:
                continue
            if r.get("code") == "ALREADY_CHECKED_IN":
                continue
            if not r.get("ok"):
                if r.get("code") not in ("ALREADY_DONE", "ELIMINATED", "FINISHED", "NOT_RUNNING"):
                    self.problem("own mark refused", crew=crew.name, round=rnd, reply=r)
                return
            if crew.style == "tie" and i == len(bots) - 1:
                await self.tie(crew)
            r = await self.call(crew, bot, "submit_key", {"p_token": mark["token"], "p_key": mark["key"], "p_seal_code": seal})
            if r and not r.get("ok") and r.get("code") not in ("ALREADY_DONE", "ELIMINATED", "NOT_RUNNING"):
                # F-06 (accepted): a key pressed in the instant the round closes reads NOT_SCANNED; the crew is out.
                again = await self.call(crew, bot, "my_status")
                if not (r.get("code") == "NOT_SCANNED" and again and again["team"]["status"] != "active"):
                    self.problem("own key refused", crew=crew.name, round=rnd, reply=r)
            if r and r.get("ok"):
                self.used["check-in (scan + key)"] += 1
                if mark["kind"] == "final":
                    self.used["final: key + seal code"] += 1

    async def tie(self, crew: Crew) -> None:
        """The tie pair: whoever gets here first waits (up to 90 s) so both crews seal at the same instant."""
        self.tie_ready.add(crew.team_id)
        partners = {c.team_id for c in self.crews if c.style == "tie" and c.outcome == ""}
        if partners <= self.tie_ready:
            self.tie_gate.set()
        try:
            await asyncio.wait_for(self.tie_gate.wait(), 90)
            self.used["two crews sealed in the same instant"] += 1
        except TimeoutError:
            pass
        self.tie_ready.discard(crew.team_id)
        if not self.tie_ready:
            self.tie_gate = asyncio.Event()

    async def prank_tricks(self, crew: Crew, rnd: int) -> None:
        bot = crew.active()[0]
        crew.log.append({"what": "pranked", "round": rnd})
        pranks = await self.s.select("qr_codes", "select=token&kind=eq.prank")
        if pranks:
            r = await self.call(crew, bot, "scan_qr", {"p_token": self.rand.choice(pranks)["token"]})
            if r and r.get("result") == "PRANK":
                self.used["prank QR (fooled)"] += 1
            else:
                self.problem("prank QR not reported as a prank", crew=crew.name, reply=r)
        later = await self.s.select("qr_codes", f"select=token,key,round&round=gt.{rnd}&kind=eq.target&limit=1")
        if later:
            r = await self.call(crew, bot, "scan_qr", {"p_token": later[0]["token"]})
            if r and r.get("code") in ("LOCKED_MARK", "NOT_YOURS"):
                self.used["later-round QR refused (D-025)"] += 1
            else:
                self.problem("later-round QR not refused", crew=crew.name, reply=r)
            r = await self.call(crew, bot, "submit_key", {"p_token": later[0]["token"], "p_key": later[0]["key"]})
            if r and r.get("code") in ("LOCKED_MARK", "NOT_SCANNED"):
                self.used["later-round key refused (D-025)"] += 1
            else:
                self.problem("later-round key not refused", crew=crew.name, reply=r)

    async def play(self, crew: Crew) -> None:
        """One crew's whole hunt; a crash in the bot itself is recorded, never allowed to stop the other crews."""
        try:
            await self._play(crew)
        except Exception as e:  # noqa: BLE001
            self.problem("bot crashed (test harness, not the game)", crew=crew.name, error=f"{type(e).__name__}: {e}")

    async def _play(self, crew: Crew) -> None:
        idle = 0
        while not self.done.is_set():
            bots = crew.active()
            if not bots:
                crew.outcome = crew.outcome or "no players left"
                return
            st = await self.call(crew, bots[0], "my_status")
            if st is None:
                continue
            team = st["team"]
            if team["status"] in ("eliminated", "finished", "disqualified"):
                crew.outcome = team["status"] + (f" #{team['final_rank']}" if team.get("final_rank") else "")
                crew.note(crew.outcome, round=(st.get("round") or {}).get("number"))
                if team["status"] == "eliminated":
                    self.used["crew eliminated"] += 1
                return
            if st["game"]["status"] == "FINISHED":
                crew.outcome = "game over"
                return
            if st["game"]["status"] != "RUNNING":
                await asyncio.sleep(1)
                continue
            phase, rnd = st.get("phase"), (st.get("round") or {}).get("number")
            if phase == "SOLVING":
                await asyncio.gather(*(self.solve(crew, b, rnd) for b in crew.active()))
            elif phase in ("SEEKING", "CHECKING_IN"):
                await self.check_in(crew, st)
            elif phase == "PENALTY":
                until = ms((st.get("penalty") or {}).get("until"))
                wait = max(0.0, ((until or 0) - time.time() * 1000) / 1000)
                self.used["penalty served at check-in"] += 1
                # A phone with a fast clock tries early: the server must say PENALTY_RUNNING.
                early = await self.call(crew, bots[0], "complete_round")
                if early and early.get("ok") and wait > 2:
                    self.problem("complete_round accepted before the penalty ended", crew=crew.name, wait=wait)
                elif early and early.get("code") == "PENALTY_RUNNING":
                    self.used["early complete_round refused"] += 1
                await asyncio.sleep(wait + 0.3)
                await self.call(crew, bots[0], "complete_round")
            else:
                idle += 1
                await asyncio.sleep(1)
                if idle > 600:
                    self.problem("crew stuck", crew=crew.name, phase=phase)
                    return

    # ── the admin bot ──────────────────────────────────────────────────────────────────────────────────
    async def admin_bot(self) -> None:
        a = self.admin

        async def do(fn: str, args: dict[str, Any] | None = None, label: str | None = None) -> Any:
            try:
                r = await a.rpc(fn, args)
                self.used[label or f"admin {fn}"] += 1
                return r
            except RpcError as e:
                self.problem("admin action failed", fn=fn, error=e.message)
                return None

        await do("set_hints", {"p_enabled": True}, "admin: hints on")
        await do("broadcast", {"p_text": "Welcome aboard, crews. Fair winds!"}, "admin: broadcast")
        # Mark one member inactive and kick another (two mid-table crews play on with three).
        snap = await a.rpc("admin_snapshot")
        teams = {t["id"]: t for t in snap["teams"]}
        mid = len(self.crews) // 2
        for crew, fn in ((self.crews[mid], "set_member_inactive"), (self.crews[mid + 1], "kick_player")):
            members = teams[crew.team_id]["members"]
            victim = next(m for m in members if m["name"] == crew.bots[3].name)
            if fn == "set_member_inactive":
                await do(fn, {"p_player": victim["id"], "p_inactive": True, "p_reason": "phone died (bot test)"}, "admin: member inactive")
                crew.bots[3].gone = "inactive"
            else:
                await do(fn, {"p_player": victim["id"], "p_reason": "left the venue (bot test)"}, "admin: kick player")
        # Pause and resume once some crews have checked in (penalties must freeze).
        await self.wait_completed(1, 3)
        await do("pause_game", label="admin: pause")
        await asyncio.sleep(12)
        await do("resume_game", label="admin: resume")
        # Round 2: re-point a crew that is still solving, and lower X by one.
        await self.wait_round_started(2)
        rounds = await self.s.select("rounds", "select=number,advance_count&order=number")
        r2 = next(r for r in rounds if r["number"] == 2)
        await do("set_advance_count", {"p_round": 2, "p_x": r2["advance_count"] - 1}, "admin: lower X live")
        spares = await self.s.select("qr_codes", "select=id&round=eq.2&is_spare=eq.true")
        if spares:
            for _ in range(60):
                states = await self.s.select("team_state", "select=team_id,round,phase&round=eq.2&phase=eq.SOLVING")
                if states:
                    await do("repoint_team", {"p_team": states[0]["team_id"], "p_qr": spares[0]["id"], "p_reason": "card torn (bot test)"}, "admin: re-point")
                    break
                await asyncio.sleep(1)
        else:
            self.used["no spare mark in round 2 to re-point to"] += 1
        await self.done.wait()

    async def wait_completed(self, rnd: int, n: int) -> None:
        while not self.done.is_set():
            if len(await self.s.select("round_results", f"select=team_id&round=eq.{rnd}")) >= n:
                return
            await asyncio.sleep(1)

    async def wait_round_started(self, rnd: int) -> None:
        while not self.done.is_set():
            if await self.s.select("team_state", f"select=team_id&round=gte.{rnd}&limit=1"):
                return
            await asyncio.sleep(1)


async def run(teams: int = 25, seed: int = 1, out: Path | None = None, pace: float = 1.0) -> dict[str, Any]:
    t_start = time.time()
    rnd = random.Random(seed)
    async with http(60) as c:
        svc = Service(c)
        w = await world.build(c)
        admin: Caller = w["admin"]
        await admin.rpc("set_team_count", {"p_count": teams})
        rows = await svc.select("teams", "select=id,code,number&order=number")

        # ── The join storm: every bot at once, one IP ──────────────────────────────────────────────
        crews = [
            Crew(i, r["id"], r["code"], CREW_NAMES[i % len(CREW_NAMES)], personality(i, teams),
                 [Bot(f"{MEMBER_NAMES[(i + k) % len(MEMBER_NAMES)]} {k + 1}") for k in range(4)])
            for i, r in enumerate(rows)
        ]
        joins: list[dict[str, Any]] = []

        async def join_bot(crew: Crew, bot: Bot) -> None:
            # A refused player tries again a few seconds later, like a person would (up to 2 minutes).
            for attempt in range(25):
                res = await join(c, bot.name, crew.code)
                if not res.ok and res.code in ("BOOT_ERROR", "SERVER") or (not res.ok and (res.code or "").startswith("HTTP_5")):
                    # The Join screen retries a function that failed to boot once by itself (F-04); so do the bots.
                    await asyncio.sleep(1.2)
                    res = await join(c, bot.name, crew.code)
                joins.append({"crew": crew.index, "bot": bot.name, "ok": res.ok, "code": res.code, "s": round(res.seconds, 3), "attempt": attempt})
                if res.ok:
                    bot.caller = res.caller
                    return
                await asyncio.sleep(5)

        t0 = time.time()
        await asyncio.gather(*(join_bot(cr, b) for cr in crews for b in cr.bots))
        storm = time.time() - t0
        joined = sum(1 for cr in crews for b in cr.bots if b.caller)
        refusals = Counter(j["code"] for j in joins if not j["ok"])

        # The first member to have joined names the crew (D-044); the others are refused.
        for cr in crews:
            named = False
            for b in cr.bots:
                if not b.caller:
                    continue
                r = await b.caller.rpc("name_crew", {"p_name": cr.name})
                if r.get("ok"):
                    named = True
                elif r.get("code") != "NOT_FIRST":
                    cr.note("naming refused", reply=r)
            if not named:
                cr.name = (await svc.select("teams", f"select=name&id=eq.{cr.team_id}"))[0]["name"]

        plan = await world.make_plan(svc, [cr.team_id for cr in crews], seed)
        applied = await admin.rpc("apply_game_plan", {"p_plan": plan})
        await admin.rpc("start_game")
        sim = Run(svc, admin, crews, seed, pace)
        sim.universal = (await svc.select("qr_codes", "select=token&kind=eq.universal"))[0]["token"]
        hunt0 = time.time()
        adm = asyncio.create_task(sim.admin_bot())

        async def watch_end() -> None:
            while True:
                g = (await svc.select("games", "select=status"))[0]
                if g["status"] == "FINISHED":
                    sim.done.set()
                    return
                await asyncio.sleep(2)

        end = asyncio.create_task(watch_end())
        try:
            await asyncio.wait_for(asyncio.gather(*(sim.play(cr) for cr in crews)), timeout=45 * 60)
        except TimeoutError:
            sim.problem("the hunt did not finish within 45 minutes")
        sim.done.set()
        await asyncio.gather(adm, end, return_exceptions=True)

        final = {t["id"]: t for t in await svc.select("teams", "select=id,status,final_rank,eliminated_in_round")}
        for cr in crews:
            t = final.get(cr.team_id, {})
            cr.outcome = f"{t.get('status')}" + (f" #{t['final_rank']}" if t.get("final_rank") else "") + (
                f" (out in {t['eliminated_in_round']})" if t.get("eliminated_in_round") else "")
        calls = [x for cr in crews for b in cr.bots if b.caller for x in b.caller.calls] + admin.calls
        lat = sorted(x[1] for x in calls)
        p95 = lat[int(len(lat) * 0.95)] if lat else 0
        summary = {
            "teams": teams,
            "seed": seed,
            "join": {
                "bots": teams * 4,
                "joined": joined,
                "storm_seconds": round(storm, 1),
                "first_try_refused": sum(1 for j in joins if not j["ok"] and j["attempt"] == 0),
                "refusals": dict(refusals),
                "p95_join_s": round(sorted(j["s"] for j in joins)[int(len(joins) * 0.95)], 2) if joins else None,
            },
            "course": {"rounds": len(plan["rounds"]), "marks": applied.get("qrs"), "advance": [r["advance_count"] for r in plan["rounds"]]},
            "hunt_minutes": round((time.time() - hunt0) / 60, 1),
            "total_minutes": round((time.time() - t_start) / 60, 1),
            "outcomes": {cr.name: f"{cr.style}: {cr.outcome}" for cr in crews},
            "used": dict(sim.used),
            "problems": sim.problems,
            "rpc": {
                "by_function_p95_ms": {
                    fn: round(sorted(x[1] for x in calls if x[0] == fn)[int(0.95 * sum(1 for x in calls if x[0] == fn))] * 1000)
                    for fn in sorted({x[0] for x in calls})
                },
                "calls": len(calls),
                "p95_ms": round(p95 * 1000),
                "http_5xx": sum(1 for x in calls if x[2] >= 500),
                "by_status": dict(Counter(x[2] for x in calls)),
            },
        }
        if out:
            out.mkdir(parents=True, exist_ok=True)
            (out / "simulation.json").write_text(json.dumps(summary, indent=2))
            (out / "crew-logs.json").write_text(json.dumps({cr.name: cr.log for cr in crews}, indent=1, default=str))
        return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--teams", type=int, default=25)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--pace", type=float, default=1.0, help="scales thinking and walking time (0.2 = five times faster)")
    a = ap.parse_args()
    print(json.dumps(asyncio.run(run(a.teams, a.seed, a.out, a.pace)), indent=2))
