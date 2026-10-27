"""Game-wide states, run last because they change the whole hunt: pause, members marked inactive or kicked (and a
kick racing a scan), eliminated crews, races at the X-th slot and New Game (SECURITY.md T12, T18, D-012, D-020)."""

from __future__ import annotations

import asyncio

from conftest import Game, refused
from lib import RpcError, ms


async def test_pause_blocks_every_action_and_freezes_penalties(game: Game):
    team = game.teams[0]["id"]
    before = (await game.s.select("team_state", f"select=phase,penalty_until&team_id=eq.{team}"))[0]
    await game.admin.rpc("pause_game")
    p = game.crews[1][0]
    t = (await game.status(p))["task"]
    for fn, args in [("scan_qr", {"p_token": game.universal}), ("submit_answer", {"p_task_id": t["id"], "p_answer": "x"}),
                     ("use_hint", {"p_task_id": t["id"]}), ("submit_key", {"p_token": "x", "p_key": "x"}), ("complete_round", {})]:
        assert await refused(p, fn, args) == "PAUSED", fn
    await asyncio.sleep(5)
    await game.admin.rpc("resume_game")
    after = (await game.s.select("team_state", f"select=phase,penalty_until&team_id=eq.{team}"))[0]
    if before["phase"] == "PENALTY" and after["phase"] == "PENALTY":
        moved = ms(after["penalty_until"]) - ms(before["penalty_until"])  # type: ignore[operator]
        assert 4500 <= moved <= 9000, f"the penalty moved {moved / 1000:.1f}s for a 5 s pause"


async def test_inactive_member_is_stopped(game: Game):
    snap = await game.admin.rpc("admin_snapshot")
    crew = next(t for t in snap["teams"] if t["id"] == game.teams[3]["id"])
    victim = crew["members"][3]
    await game.admin.rpc("set_member_inactive", {"p_player": victim["id"], "p_inactive": True, "p_reason": "attack suite"})
    p = next(c for c in game.crews[3] if c.label == victim["name"])
    assert await refused(p, "scan_qr", {"p_token": game.universal}) in ("INACTIVE", "ALREADY_DONE")
    t = (await game.status(p))["task"]
    if t and not t["solved"]:
        code = await refused(p, "submit_answer", {"p_task_id": t["id"], "p_answer": "x"})
        assert code in ("INACTIVE", "NOT_YOUR_TASK"), code


async def test_kick_racing_a_scan_never_errors(game: Game):
    """The admin kicks a player at the instant their phone scans: the phone must get a clean refusal
    (NOT_REGISTERED), never a server error (the bot run caught this as a foreign-key failure)."""
    snap = await game.admin.rpc("admin_snapshot")
    crew = next(t for t in snap["teams"] if t["id"] == game.teams[3]["id"])
    errors = []
    for m in crew["members"][:2]:
        p = next(c for c in game.crews[3] if c.label == m["name"])

        async def scan_storm() -> None:
            for _ in range(6):
                try:
                    await p.rpc("scan_qr", {"p_token": game.universal})
                except RpcError as e:
                    if e.message not in ("NOT_REGISTERED", "SESSION_MOVED"):
                        errors.append(e.message)

        await asyncio.gather(scan_storm(), game.admin.rpc("kick_player", {"p_player": m["id"], "p_reason": "attack suite"}))
        try:
            await p.rpc("my_status")
            raise AssertionError("a kicked player's phone still works")
        except RpcError as e:
            assert e.message == "NOT_REGISTERED", e.message
    assert not errors, f"a scan racing a kick failed with a server error: {errors[0]}"


async def test_double_complete_round_counts_once(game: Game):
    """Crew A's penalty (from the cheats file) ends; two phones call complete_round at the same instant."""
    team = game.teams[0]["id"]
    st = (await game.s.select("team_state", f"select=phase,penalty_until,round&team_id=eq.{team}"))[0]
    if st["phase"] != "PENALTY":
        return
    wait = max(0.0, (ms(st["penalty_until"]) - __import__("time").time() * 1000) / 1000)  # type: ignore[operator]
    await asyncio.sleep(wait + 0.5)
    await asyncio.gather(*(p.rpc("complete_round") for p in game.crews[0][:2]), return_exceptions=True)
    got = await game.s.select("round_results", f"select=round&team_id=eq.{team}&round=eq.{st['round']}")
    assert len(got) == 1, f"{len(got)} results for one round"


async def test_eliminated_crew_can_do_nothing(game: Game):
    """Lowering X to the crews already through closes round 1 at once; the rest are out and refused."""
    done = len(await game.s.select("round_results", "select=team_id&round=eq.1"))
    if not done:
        return
    await game.admin.rpc("set_advance_count", {"p_round": 1, "p_x": done})
    out = await game.s.select("teams", "select=id,status&status=eq.eliminated")
    assert out, "nobody was eliminated"
    i = next(i for i, t in enumerate(game.teams) if t["id"] == out[0]["id"])
    p = next(c for c in game.crews[i] if c.token)
    try:
        code = await refused(p, "scan_qr", {"p_token": game.universal})
    except RpcError as e:
        code = e.message
    assert code in ("ELIMINATED", "INACTIVE", "NOT_REGISTERED"), code


async def test_new_game_signs_every_phone_out(game: Game):
    await game.admin.rpc("start_new_game", {"p_confirm": "NEW GAME", "p_regenerate_qr": False, "p_keep_crews": False})
    for crew in game.crews:
        p = crew[0]
        try:
            await p.rpc("my_status")
            raise AssertionError("a phone kept its session after New Game")
        except RpcError as e:
            assert e.message == "NOT_REGISTERED", e.message
    assert not await game.s.select("players", "select=id"), "players left after New Game"
    assert not await game.s.select("teams", "select=id"), "crews left after New Game (D-046)"
