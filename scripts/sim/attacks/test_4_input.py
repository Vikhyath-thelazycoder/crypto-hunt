"""Hostile input (SECURITY.md T15): SQL injection, very long strings, HTML and script in every free-text field.
Each must be refused or stored as plain text; nothing may break or run."""

from __future__ import annotations

import json

from conftest import Game, refused
from lib import RpcError

NASTY = [
    "'; DROP TABLE teams; --",
    "\" OR \"1\"=\"1",
    "<script>alert('x')</script>",
    "<img src=x onerror=alert(1)>",
    "{{constructor.constructor('alert(1)')()}}",
    "A" * 5000,
    "‮evil‬",
]


async def test_answers_with_injection_are_just_wrong(game: Game):
    p = game.crews[3][2]
    t = await game.open_task(p)
    if t["format"] == "mcq":
        for s in NASTY[:3]:
            assert await refused(p, "submit_answer", {"p_task_id": t["id"], "p_answer": s}) in ("BAD_ANSWER", "RATE_LIMITED")
        return
    for s in NASTY[:4]:
        r = await p.rpc("submit_answer", {"p_task_id": t["id"], "p_answer": s})
        assert r.get("correct") is False or r.get("code") == "RATE_LIMITED", r
    assert len(await game.s.select("teams", "select=id")) == 4, "teams table damaged"


async def test_keys_with_injection_are_refused(game: Game):
    p = game.crews[3][3]
    for s in NASTY:
        code = await refused(p, "submit_key", {"p_token": s, "p_key": s, "p_seal_code": s})
        assert code in ("BAD_QR", "NOT_SCANNED", "RATE_LIMITED", "SOLVE_FIRST"), code
    for s in NASTY:
        code = await refused(p, "scan_qr", {"p_token": s})
        assert code in ("BAD_QR", "RATE_LIMITED"), code


async def test_broadcast_and_crew_names_are_stored_as_plain_text(game: Game):
    a = game.admin
    for s in NASTY:
        try:
            await a.rpc("broadcast", {"p_text": s})
        except RpcError as e:
            assert e.message in ("BAD_TEXT", "TOO_LONG", "VALIDATION") or "check" in e.message or "value too long" in e.message, e.message
            continue
        g = (await game.s.select("games", "select=broadcast"))[0]
        assert g["broadcast"] == s.strip() or g["broadcast"] == s, "the broadcast was altered"
    await a.rpc("broadcast", {"p_text": ""})
    team = game.teams[3]["id"]
    for s in NASTY:
        try:
            await a.rpc("rename_team", {"p_team": team, "p_name": s})
        except RpcError:
            continue
        r = (await game.s.select("teams", f"select=name&id=eq.{team}"))[0]["name"]
        assert r == s.strip(), "the crew name was altered"
    pub = json.dumps((await game.anon().get("public_state", "select=data")).json())
    assert "teams" in pub  # still valid JSON for the projector


async def test_crew_naming_is_closed_once_the_hunt_runs(game: Game):
    assert await refused(game.crews[2][0], "name_crew", {"p_name": "<b>Pirates</b>"}) in ("GAME_STARTED", "ALREADY_NAMED", "NOT_FIRST")


async def test_focus_report_numbers_are_sane(game: Game):
    p = game.crews[2][1]
    t = (await game.status(p))["task"]
    if not t:
        return
    for away in (-1, 10**12):
        try:
            await p.rpc("report_focus_event", {"p_task_id": t["id"], "p_kind": "blur", "p_away_ms": away})
        except RpcError as e:
            assert e.status < 500, e
