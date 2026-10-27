"""Game cheats (SECURITY.md T1–T4, T9–T12, D-025, D-026, D-029, D-041): each one tried by a real player through the
real RPCs. Every attempt must be refused (and alert the admin where the PRD says so) and change nothing it shouldn't."""

from __future__ import annotations

import asyncio

from conftest import Game, refused


async def team_of(game: Game, i: int) -> str:
    return game.teams[i]["id"]


async def test_another_crews_mark_is_refused(game: Game):
    a, b = game.crews[0][0], await team_of(game, 1)
    await game.open_task(a)
    other = await game.mark(b, 1)
    mine = await game.mark(await team_of(game, 0), 1)
    if other["id"] == mine["id"]:
        return  # shared round-1 mark (more crews than marks): nothing to steal
    assert await refused(a, "scan_qr", {"p_token": other["token"]}) in ("SOLVE_FIRST", "NOT_YOURS")
    assert await refused(a, "submit_key", {"p_token": other["token"], "p_key": other["key"]}) == "NOT_SCANNED"


async def test_later_rounds_mark_and_key_are_refused_and_alerted(game: Game):
    a = game.crews[0][1]
    later = (await game.s.select("qr_codes", "select=token,key,round&kind=eq.target&round=eq.3&limit=1"))[0]
    assert await refused(a, "scan_qr", {"p_token": later["token"]}) in ("LOCKED_MARK", "NOT_YOURS")
    assert await refused(a, "submit_key", {"p_token": later["token"], "p_key": later["key"]}) == "LOCKED_MARK"
    assert await game.alerts("locked_key"), "no alert for a later round's key"
    # The early scan is not remembered: no ticket was issued.
    tickets = await game.s.select("scan_tickets", "select=player_id,round")
    assert all(t["round"] <= 1 for t in tickets), "a later round's scan left a ticket"


async def test_final_mark_early_is_refused(game: Game):
    a = game.crews[0][2]
    final = (await game.s.select("qr_codes", "select=token,key&kind=eq.final"))[0]
    assert await refused(a, "scan_qr", {"p_token": final["token"]}) == "LOCKED_MARK"
    assert await refused(a, "submit_key", {"p_token": final["token"], "p_key": final["key"], "p_seal_code": "AAAAAA"}) == "LOCKED_MARK"


async def test_prank_mark_fools_and_its_fake_key_counts_for_nothing(game: Game):
    a = game.crews[3][0]
    prank = await game.s.select("qr_codes", "select=token&kind=eq.prank&limit=1")
    if not prank:
        return
    r = await a.rpc("scan_qr", {"p_token": prank[0]["token"]})
    assert r.get("result") == "PRANK", r
    assert await refused(a, "submit_key", {"p_token": prank[0]["token"], "p_key": r["fake_key"]}) in ("NOT_SCANNED", "BAD_KEY")


async def test_key_without_a_scan_is_refused(game: Game):
    a = game.crews[1][0]
    mine = await game.mark(await team_of(game, 1), 1)
    assert await refused(a, "submit_key", {"p_token": mine["token"], "p_key": mine["key"]}) == "NOT_SCANNED"


async def test_key_guessing_is_rate_limited_and_alerted(game: Game):
    """Crew C solves round 1, scans its mark, then a member guesses keys: the 6th try in a minute is refused."""
    crew, team = game.crews[2], await team_of(game, 2)
    await game.solve_all(crew)
    mine = await game.mark(team, 1)
    p = crew[0]
    assert (await p.rpc("scan_qr", {"p_token": mine["token"]})).get("ok")
    codes = [await refused(p, "submit_key", {"p_token": mine["token"], "p_key": f"ZZZZZ{k}"}) for k in range(7)]
    assert codes[:5] == ["BAD_KEY"] * 5 and set(codes[5:]) == {"RATE_LIMITED"}, codes
    assert await game.alerts("key_spam") and await game.alerts("bad_keys")


async def test_answer_brute_force_is_rate_limited_and_still_penalised(game: Game):
    """Crew D, member 2 sprays wrong answers: the 11th in a minute is refused; the 10 that counted add 3 minutes."""
    p, team = game.crews[3][1], await team_of(game, 3)
    task = await game.open_task(p)
    before = (await game.s.select("team_state", f"select=penalty_ms&team_id=eq.{team}"))[0]["penalty_ms"]
    replies = []
    for k in range(12):
        t = (await game.status(p))["task"]
        answer = str((int(await game.answer(t["id"])) + 1) % 4) if t["format"] == "mcq" else f"wrong {k}"
        replies.append(await p.rpc("submit_answer", {"p_task_id": t["id"], "p_answer": answer}))
    limited = [r for r in replies if r.get("code") == "RATE_LIMITED"]
    assert len(limited) == 2, replies
    assert await game.alerts("answer_spam")
    after = (await game.s.select("team_state", f"select=penalty_ms&team_id=eq.{team}"))[0]["penalty_ms"]
    assert after - before == 3 * 60_000, f"10 wrong answers should add 3:00, added {(after - before) / 1000:.0f}s"
    assert task  # the task existed


async def test_tapping_every_multiple_choice_option_never_wins(game: Game):
    """A wrong pick swaps the question, so trying A, B, C, D in turn never finds the answer by elimination."""
    for crew in game.crews[:2]:
        for p in crew:
            t = await game.open_task(p)
            if t and t["format"] == "mcq" and not t["solved"]:
                seen = {t["text"]}
                right = int(await game.answer(t["id"]))
                for pick in range(4):
                    if pick == right:
                        continue
                    r = await p.rpc("submit_answer", {"p_task_id": t["id"], "p_answer": str(pick)})
                    assert r.get("correct") is False and r.get("replaced"), r
                    t = (await game.status(p))["task"]
                    assert t["text"] not in seen, "a swapped-out question came back"
                    seen.add(t["text"])
                    if t["format"] != "mcq":
                        break  # the swap drew a typed question: nothing left to tap
                    right = int(await game.answer(t["id"]))
                return


async def test_hint_on_multiple_choice_is_refused(game: Game):
    await game.admin.rpc("set_hints", {"p_enabled": True})
    for crew in game.crews:
        for p in crew:
            t = (await game.status(p))["task"]
            if t and t["format"] == "mcq" and t["opened"] and not t["solved"]:
                assert await refused(p, "use_hint", {"p_task_id": t["id"]}) == "NO_HINT"
                return


async def test_someone_elses_task_is_refused(game: Game):
    a, b = game.crews[0][0], game.crews[1][3]
    tb = await game.open_task(b)
    assert await refused(a, "submit_answer", {"p_task_id": tb["id"], "p_answer": await game.answer(tb["id"])}) == "NOT_YOUR_TASK"
    assert await refused(a, "use_hint", {"p_task_id": tb["id"]}) == "NOT_YOUR_TASK"


async def test_one_member_cannot_check_in_for_the_crew(game: Game):
    """Crew A solves; one member scans and keys four times: it counts once, the crew is not through."""
    crew, team = game.crews[0], await team_of(game, 0)
    await game.solve_all(crew)
    mine = await game.mark(team, 1)
    p = crew[0]
    for _ in range(4):
        await p.rpc("scan_qr", {"p_token": mine["token"]})
        await p.rpc("submit_key", {"p_token": mine["token"], "p_key": mine["key"]})
    st = (await game.s.select("team_state", f"select=phase,round&team_id=eq.{team}"))[0]
    assert st["round"] == 1 and st["phase"] == "CHECKING_IN", st


async def test_replayed_or_expired_scan_ticket_is_refused(game: Game):
    crew, team = game.crews[0], await team_of(game, 0)
    mine = await game.mark(team, 1)
    p = crew[1]
    assert (await p.rpc("scan_qr", {"p_token": mine["token"]})).get("ok")
    pid = (await game.s.select("players", f"select=id&team_id=eq.{team}&name=eq.{p.label}"))[0]["id"]
    await game.s.update("scan_tickets", f"player_id=eq.{pid}", {"expires_at": "2000-01-01T00:00:00Z"})
    assert await refused(p, "submit_key", {"p_token": mine["token"], "p_key": mine["key"]}) == "NOT_SCANNED"
    # A fresh scan works once; replaying the key afterwards finds no ticket.
    assert (await p.rpc("scan_qr", {"p_token": mine["token"]})).get("ok")
    assert (await p.rpc("submit_key", {"p_token": mine["token"], "p_key": mine["key"]})).get("ok")
    assert await refused(p, "submit_key", {"p_token": mine["token"], "p_key": mine["key"]}) in ("NOT_SCANNED", "ALREADY_DONE")


async def test_penalty_cannot_be_cut_short(game: Game):
    """Crew A takes a hint in round 2, then checks in: complete_round before the minute is up is refused."""
    crew, team = game.crews[0], await team_of(game, 0)
    await asyncio.sleep(61)  # the key-guessing tests above used up member 1's five tries this minute
    await game.check_in_all(crew, team)  # finishes round 1 (members 3 and 4)
    st = await game.status(crew[0])
    if st["phase"] == "PENALTY":
        # An earlier attack (wrong multiple-choice picks) may have earned the crew a minute: serve it first.
        from lib import ms as to_ms
        import time as _t

        await asyncio.sleep(max(0.0, (to_ms(st["penalty"]["until"]) - _t.time() * 1000) / 1000) + 1)  # type: ignore[operator]
        await crew[0].rpc("complete_round")
        st = await game.status(crew[0])
    assert st["round"]["number"] == 2, st["phase"]
    for p in crew:
        t = await game.open_task(p)
        if t["format"] != "mcq" and t.get("has_hint"):
            assert (await p.rpc("use_hint", {"p_task_id": t["id"]})).get("ok")
            break
    else:
        await game.s.update("team_state", f"team_id=eq.{team}", {"penalty_ms": 60000})  # no hintable question drawn
    await game.solve_all(crew)
    await game.check_in_all(crew, team)
    st = await game.status(crew[0])
    assert st["phase"] == "PENALTY", st["phase"]
    assert await refused(crew[0], "complete_round") == "PENALTY_RUNNING"
    assert (await game.s.select("team_state", f"select=round&team_id=eq.{team}"))[0]["round"] == 2


async def test_leaving_the_site_is_reported_to_the_admin(game: Game):
    p = game.crews[1][2]
    t = await game.open_task(p)
    r = await p.rpc("report_focus_event", {"p_task_id": t["id"], "p_kind": "hidden", "p_away_ms": 45000})
    assert r.get("ok") is not False
    assert await game.alerts("left_site")
    assert await refused(p, "report_focus_event", {"p_task_id": t["id"], "p_kind": "<script>", "p_away_ms": 1}) == "BAD_KIND"


async def test_two_phones_answering_at_once_count_once(game: Game):
    """The same player's request sent twice at the same instant: one solve, not two."""
    p = game.crews[1][1]
    t = await game.open_task(p)
    if t["solved"]:
        return
    ans = await game.answer(t["id"])
    a, b = await asyncio.gather(
        p.rpc("submit_answer", {"p_task_id": t["id"], "p_answer": ans}), p.rpc("submit_answer", {"p_task_id": t["id"], "p_answer": ans})
    )
    assert [a.get("correct"), b.get("correct")].count(True) == 1, (a, b)
