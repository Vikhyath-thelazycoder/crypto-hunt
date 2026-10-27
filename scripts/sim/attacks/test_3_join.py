"""Joining (D-005, D-044, SECURITY.md T10, T11, T14): crew codes, the four-member cap, one phone per player, the
join function's inputs and its per-IP limit. Runs after the cheats; the IP floods go last in this file."""

from __future__ import annotations

import random
import string

from conftest import Game, refused
from lib import RpcError, join, preview


async def test_fifth_member_is_refused(game: Game):
    r = await join(game.c, "Fifth Hand", game.teams[0]["code"])
    assert not r.ok and r.code in ("TEAM_FULL", "TEAM_LOCKED", "REGISTRATION_CLOSED"), r.code


async def test_made_up_and_malformed_codes_are_refused(game: Game):
    for code in ("ZZZZZZ", "zz", "' OR 1=1 --", "A" * 500):
        r = await join(game.c, "Stray Cat", code)
        # HTTP_403: Supabase's edge firewall drops injection-looking bodies before the function runs (also a refusal).
        assert not r.ok and r.code in ("BAD_CODE", "REGISTRATION_CLOSED", "HTTP_403"), (code, r.code)


async def test_bad_player_names_are_refused(game: Game):
    for name in ("<script>alert(1)</script>", "x", "A" * 41, "Robert'); DROP TABLE players;--", "\u0000null"):
        r = await join(game.c, name, game.spare_code)
        assert not r.ok and r.code == "BAD_NAME", (name, r.code)


async def test_joining_after_the_start_is_refused(game: Game):
    r = await join(game.c, "Late Larry", game.spare_code)
    assert not r.ok and r.code in ("REGISTRATION_CLOSED", "TEAM_FULL", "TEAM_LOCKED"), r.code


async def test_forged_user_id_and_ip_in_the_body_are_ignored(game: Game):
    victim = (await game.s.select("players", "select=user_id,team_id&limit=1"))[0]
    r = await join(game.c, "Sneaky Pete", game.teams[0]["code"], extra={"user_id": victim["user_id"], "ip": "10.0.0.1"})
    assert not r.ok, "a join with a forged user_id got in"
    assert (await game.s.select("players", f"select=user_id&user_id=eq.{victim['user_id']}"))[0], "victim lost its account"


async def test_same_player_on_a_second_phone_moves_the_session_and_alerts(game: Game):
    """Rejoining with the same name and code is allowed (a dead phone), but the old phone is signed out and the
    admin is alerted (T11), so a teammate can't quietly play two members."""
    crew = game.crews[1]
    name = crew[3].label
    old = crew[3]
    r = await join(game.c, name, game.teams[1]["code"])
    if not r.ok:
        assert r.code in ("REGISTRATION_CLOSED", "TEAM_LOCKED"), r.code
        return
    try:
        await old.rpc("my_status")
        raise AssertionError("the old phone still works after the takeover")
    except RpcError as e:
        assert e.message == "SESSION_MOVED", e.message
    crew[3] = r.caller  # type: ignore[assignment]
    assert await game.alerts("session_moved") or await game.alerts("takeover"), "no alert for the second phone"


async def test_old_phone_cannot_claim_again(game: Game):
    p = game.crews[0][0]
    assert await refused(p, "claim_session", {"p_nonce": "a" * 32}) == "BAD_CLAIM"


async def test_join_limit_cannot_be_dodged_with_a_forged_forwarded_for(game: Game):
    """The function trusts X-Forwarded-For for its per-IP limit: a client that sends its own random one must not get
    a fresh allowance on every request."""
    forged = [f"198.51.100.{random.randint(1, 254)}" for _ in range(5)]
    for ip in forged:
        await preview(game.c, "ZZZZZZ", {"X-Forwarded-For": ip})
    counted = {r["subject"] for r in await game.s.select("rate_limits", "select=subject&bucket=eq.join")}
    trusted = [ip for ip in forged if f"ip:{ip}" in counted]
    assert not trusted, f"the join limit counted client-chosen addresses {trusted}: anyone can dodge it with a forged X-Forwarded-For"


async def test_lookup_flood_from_one_address_is_limited(game: Game):
    import asyncio

    # The limit counts in fixed one-minute windows: start a fresh one so the flood can't straddle two.
    await game.s.delete("rate_limits", "bucket=eq.join")
    limited = 0
    for _ in range(14):  # 700 lookups, 50 at a time: past the 600-a-minute limit (F-01)
        rs = await asyncio.gather(*(preview(game.c, "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))) for _ in range(50)))
        limited += sum(r.get("code") == "RATE_LIMITED" for r in rs)
    assert limited > 0, "700 code lookups in a minute from one address were never limited"
