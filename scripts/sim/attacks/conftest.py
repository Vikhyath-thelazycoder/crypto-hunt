"""T-806 attack suite: a small live hunt on the TEST project (four crews of four, joined through the real join
function, the real course, started by a real admin) that every attack runs against, as a real player or an
anonymous caller. Files run in name order; the ones that change the whole game (pause, kick, New Game) run last.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import world  # noqa: E402
from lib import ANON, URL, Caller, RpcError, Service, http, join  # noqa: E402


@dataclass
class Game:
    c: httpx.AsyncClient
    s: Service
    admin: Caller
    teams: list[dict[str, Any]]  # id, code, number, name
    crews: list[list[Caller]]
    spare_code: str  # a full crew's code (joining it is refused one way or another)
    universal: str
    notes: list[str] = field(default_factory=list)

    def anon(self) -> Caller:
        return Caller(self.c, None, None, "anon")

    async def status(self, p: Caller) -> dict[str, Any]:
        return await p.rpc("my_status")

    async def mark(self, team: str, rnd: int) -> dict[str, Any]:
        rows = await self.s.select("assignments", f"select=qr_codes(id,token,key,label,kind,round)&team_id=eq.{team}&round=eq.{rnd}")
        return rows[0]["qr_codes"]

    async def answer(self, task_id: str) -> str:
        row = (await self.s.select("tasks", f"select=option_order,questions(answer,format)&id=eq.{task_id}"))[0]
        q = row["questions"]
        return q["answer"] if q["format"] != "mcq" else str(row["option_order"].index(int(q["answer"])))

    async def open_task(self, p: Caller) -> dict[str, Any]:
        st = await self.status(p)
        if st["round"]["number"] == 1 and not st["task"]["opened"]:
            await p.rpc("scan_qr", {"p_token": self.universal})
            st = await self.status(p)
        return st["task"]

    async def solve_all(self, crew: list[Caller]) -> None:
        for p in crew:
            t = await self.open_task(p)
            if t and not t["solved"]:
                r = await p.rpc("submit_answer", {"p_task_id": t["id"], "p_answer": await self.answer(t["id"])})
                assert r.get("correct"), r

    async def check_in_all(self, crew: list[Caller], team: str) -> dict[str, Any]:
        st = await self.status(crew[0])
        m = await self.mark(team, st["round"]["number"])
        last: dict[str, Any] = {}
        for p in crew:
            r = await p.rpc("scan_qr", {"p_token": m["token"]})
            if r.get("code") == "ALREADY_CHECKED_IN":
                continue
            assert r.get("ok"), r
            last = await p.rpc("submit_key", {"p_token": m["token"], "p_key": m["key"], "p_seal_code": st.get("seal_code")})
            assert last.get("ok"), last
        return last

    async def alerts(self, kind: str) -> list[dict[str, Any]]:
        return await self.s.select("alerts", f"select=*&kind=eq.{kind}")


@pytest.fixture(scope="session")
async def game():
    async with http(60) as c:
        w = await world.build(c)
        s = Service(c)
        admin: Caller = w["admin"]
        await admin.rpc("set_team_count", {"p_count": 4})
        teams = await s.select("teams", "select=id,code,number,name&order=number")
        crews: list[list[Caller]] = []
        for t in teams:
            crew = []
            for k in range(4):
                r = await join(c, f"{t['name'].split()[0]} {k + 1}", t["code"])
                assert r.ok, r.code
                crew.append(r.caller)
            crews.append(crew)
        plan = await world.make_plan(s, [t["id"] for t in teams], 5, counts=[6, 4, 2, 1], advance=[4, 4, 3, 2])
        await admin.rpc("apply_game_plan", {"p_plan": plan})
        await admin.rpc("start_game")
        universal = (await s.select("qr_codes", "select=token&kind=eq.universal"))[0]["token"]
        yield Game(c, s, admin, teams, crews, teams[3]["code"], universal)


async def refused(p: Caller, fn: str, args: dict[str, Any] | None = None) -> str:
    """The RPC must fail: returns the raised message, or the {ok:false} code."""
    try:
        r = await p.rpc(fn, args)
    except RpcError as e:
        return e.message
    assert isinstance(r, dict) and r.get("ok") is False, f"{fn} was accepted: {r}"
    return r.get("code", "")


__all__ = ["Game", "refused", "ANON", "URL"]
