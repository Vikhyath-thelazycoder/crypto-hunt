"""Access (SECURITY.md T5–T8, T13, T16): what a player and an anonymous caller can read, write and call directly
through the REST API, Storage and Auth, bypassing the site."""

from __future__ import annotations

import base64
import json
from typing import Any

import pytest

from conftest import ANON, URL, Game, refused
from lib import RpcError

TABLES = [
    "admin_audit", "admins", "alerts", "assignments", "cards", "checkins", "clue_sets", "events", "games", "locations",
    "players", "public_state", "qr_codes", "qr_links", "questions", "rate_limits", "round_results", "rounds",
    "scan_tickets", "tasks", "team_state", "teams", "venue_map",
]
# Readable on purpose: the public state (leaderboard), the map image's row, and a player's own progress row.
OPEN_TO_ANON = {"public_state", "venue_map"}
OPEN_TO_PLAYER = {"public_state", "venue_map", "team_state"}
# The universal start token is public on purpose (the projector shows it as a QR), so "token" means any other token.
SECRETS = ("answer", "\"token\"", "qr_token", "\"key\"", "final_code", "completion_key", "claim_nonce", "map_x", "pieces", "notes")


async def rows(p: Any, table: str) -> tuple[int, list[dict[str, Any]]]:
    r = await p.get(table, "select=*")
    try:
        body = r.json()
    except ValueError:
        body = []
    return r.status_code, body if isinstance(body, list) else []


@pytest.mark.parametrize("table", TABLES)
async def test_anon_reads_nothing_but_the_public_state(game: Game, table: str):
    status, got = await rows(game.anon(), table)
    if table in OPEN_TO_ANON:
        assert not any(s in json.dumps(got) for s in SECRETS), f"anon read secrets from {table}"
    else:
        assert got == [], f"anon read {len(got)} rows of {table} (HTTP {status})"


@pytest.mark.parametrize("table", TABLES)
async def test_player_reads_only_its_own_progress(game: Game, table: str):
    me = game.crews[0][0]
    mine = (await game.status(me))["team"]["id"]
    status, got = await rows(me, table)
    if table == "team_state":
        assert {r["team_id"] for r in got} <= {mine}, "a player read another crew's progress"
    elif table in OPEN_TO_PLAYER:
        assert not any(s in json.dumps(got) for s in SECRETS), f"player read secrets from {table}"
    else:
        assert got == [], f"a player read {len(got)} rows of {table} (HTTP {status})"


# Tables whose key is an identity column: update another column instead (an identity can't be set at all).
UPDATE_COL = {"admin_audit": "reason", "alerts": "acknowledged", "events": "kind"}
KEY = {
    "admins": "user_id", "assignments": "team_id", "cards": "location_id", "checkins": "player_id", "clue_sets": "location_id",
    "qr_links": "from_qr", "rate_limits": "subject", "round_results": "team_id", "rounds": "number", "scan_tickets": "player_id",
    "team_state": "team_id",
}


def blocked(r: Any) -> bool:
    """Refused for lack of a privilege, or allowed through but filtered to nothing by row security."""
    if r.status_code in (401, 403):
        return True
    if r.status_code in (200, 201, 204):
        return r.content in (b"", b"[]")
    return "permission denied" in r.text or "row-level security" in r.text


@pytest.mark.parametrize("table", TABLES)
async def test_nobody_writes_or_deletes_rows_directly(game: Game, table: str):
    col = KEY.get(table, "id")
    before = json.dumps(await game.s.select(table, f"select=*&order={col}"), sort_keys=True)
    for who in (game.anon(), game.crews[0][0]):
        h = {**who.headers(), "Prefer": "return=representation"}
        ins = await game.c.post(f"{URL}/rest/v1/{table}", headers=h, json={})
        assert blocked(ins), f"insert into {table} as {who.label}: HTTP {ins.status_code} {ins.text[:160]}"
        up_col = UPDATE_COL.get(table, col)
        up = await game.c.patch(f"{URL}/rest/v1/{table}?{col}=not.is.null", headers=h, json={up_col: None})
        assert blocked(up), f"update of {table} as {who.label}: HTTP {up.status_code} {up.text[:160]}"
        de = await game.c.delete(f"{URL}/rest/v1/{table}?{col}=not.is.null", headers=h)
        assert blocked(de), f"delete from {table} as {who.label}: HTTP {de.status_code} {de.text[:160]}"
    assert json.dumps(await game.s.select(table, f"select=*&order={col}"), sort_keys=True) == before, f"{table} changed"


ADMIN_RPCS = {
    "create_teams": {"p_count": 1}, "set_team_count": {"p_count": 0}, "rename_team": {"p_team": None, "p_name": "x"},
    "delete_team": {"p_team": None, "p_reason": "x"}, "set_registration": {"p_open": True}, "apply_game_plan": {"p_plan": {}},
    "start_game": {}, "pause_game": {}, "resume_game": {}, "broadcast": {"p_text": "pwned"}, "set_hints": {"p_enabled": True},
    "set_advance_count": {"p_round": 1, "p_x": 1}, "end_game": {"p_reason": "x"}, "move_team": {"p_team": None, "p_round": 1, "p_reason": "x"},
    "set_member_inactive": {"p_player": None, "p_inactive": True, "p_reason": "x"}, "repoint_team": {"p_team": None, "p_qr": None, "p_reason": "x"},
    "kick_player": {"p_player": None, "p_reason": "x"}, "disqualify_team": {"p_team": None, "p_reason": "x"},
    "force_complete": {"p_team": None, "p_reason": "x"}, "ack_alert": {"p_id": 1}, "ack_all_alerts": {}, "export_results": {},
    "start_new_game": {"p_confirm": "NEW GAME", "p_regenerate_qr": False, "p_keep_crews": True}, "admin_snapshot": {},
    "join_preflight": {"p_name": "x", "p_code": "AAAAAA", "p_ip": "1"}, "join_commit": {"p_user_id": None, "p_name": "x", "p_code": "AAAAAA"},
}
INTERNAL = [
    "_admin", "_after_piece", "_alert", "_answer_ok", "_assign_paths", "_audit", "_check_link_area", "_check_team_in",
    "_close_round", "_complete_round", "_create_tasks", "_ctx", "_delete_player_users", "_eliminate", "_event", "_fail",
    "_hit", "_key_eq", "_maybe_finish", "_merge_member", "_norm", "_option_order", "_pick_clue_set", "_pick_question",
    "_players_max_four", "_question_guard", "_random_code", "_reason", "_refresh_public", "_settle_penalties",
    "_start_round", "_token", "_unlock_crew_name", "_round_progress_lock", "_submit_key_body", "_set_advance_count_body",
    "_force_complete_body",
]


@pytest.mark.parametrize("fn", sorted(ADMIN_RPCS))
async def test_admin_rpcs_refuse_players_and_anon(game: Game, fn: str):
    for who in (game.crews[1][0], game.anon()):
        try:
            r = await who.rpc(fn, ADMIN_RPCS[fn])
        except RpcError as e:
            assert e.status in (400, 401, 403, 404), e
            continue
        raise AssertionError(f"{fn} ran for {who.label}: {str(r)[:200]}")
    g = (await game.s.select("games", "select=status,broadcast"))[0]
    assert g["status"] == "RUNNING" and g["broadcast"] != "pwned"


@pytest.mark.parametrize("fn", INTERNAL)
async def test_internal_helpers_are_not_callable(game: Game, fn: str):
    for who in (game.crews[1][0], game.anon()):
        with pytest.raises(RpcError):
            await who.rpc(fn, {})


async def test_player_rpcs_refuse_anon(game: Game):
    for fn, args in [("my_status", {}), ("scan_qr", {"p_token": game.universal}), ("complete_round", {}),
                     ("submit_key", {"p_token": "x", "p_key": "x"}), ("name_crew", {"p_name": "Pirates"})]:
        with pytest.raises(RpcError):
            await game.anon().rpc(fn, args)


async def test_storage_refuses_players_and_anon(game: Game):
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    # A throwaway file the test owns, so the check never depends on (or damages) the real map.
    from lib import SERVICE, key_headers

    canary = "attack-canary.png"
    await game.c.post(f"{URL}/storage/v1/object/venue/{canary}", headers={**key_headers(SERVICE), "Content-Type": "image/png", "x-upsert": "true"}, content=png)
    for who in (game.anon(), game.crews[0][0]):
        h = {k: v for k, v in who.headers().items() if k != "Content-Type"}
        up = await game.c.post(f"{URL}/storage/v1/object/venue/evil-{who.label[:4]}.png", headers={**h, "Content-Type": "image/png"}, content=png)
        assert up.status_code >= 400, f"{who.label} uploaded to the venue bucket"
        over = await game.c.post(f"{URL}/storage/v1/object/venue/{canary}", headers={**h, "Content-Type": "image/png", "x-upsert": "true"}, content=png[:40])
        assert over.status_code >= 400, f"{who.label} overwrote a venue file"
        de = await game.c.delete(f"{URL}/storage/v1/object/venue/{canary}", headers=h)
        still = await game.c.get(f"{URL}/storage/v1/object/public/venue/{canary}")
        assert still.status_code == 200, f"{who.label} deleted a venue file ({de.status_code})"
    await game.c.delete(f"{URL}/storage/v1/object/venue/{canary}", headers=key_headers(SERVICE))


async def test_tampered_token_is_refused(game: Game):
    me = game.crews[0][0]
    head, body, sig = me.token.split(".")  # type: ignore[union-attr]
    claims = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    claims["role"] = "service_role"
    forged = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    r = await game.c.post(f"{URL}/rest/v1/rpc/my_status", headers={"apikey": ANON, "Authorization": f"Bearer {head}.{forged}.{sig}"}, json={})
    assert r.status_code in (401, 403), f"a forged token was accepted ({r.status_code})"
    r = await game.c.get(f"{URL}/rest/v1/questions?select=answer", headers={"apikey": ANON, "Authorization": f"Bearer {head}.{forged}.{sig}"})
    assert r.status_code in (401, 403), "a forged service-role token read the answers"


async def test_my_status_and_public_state_carry_no_secrets(game: Game):
    raw = await game.status(game.crews[2][0])
    st = json.dumps(raw)
    for s in ("\"answer\"", "token", "\"key\"", "map_x", "place_no", "notes", "claim_nonce", "final_code"):
        assert s not in st, f"my_status carries {s}"
    # The crew's own completion key appears only once it has finished.
    assert raw["team"].get("completion_key") is None and raw.get("seal_code") is None, "a key or seal code before its time"
    pub = (await game.anon().get("public_state", "select=data")).json()[0]["data"]
    txt = json.dumps(pub)
    for s in ("\"key\"", "final_code", "completion_key", "map_x", "place_no", "landmark", "notes"):
        assert s not in txt, f"public_state carries {s}"
    others = [t for t in pub["teams"]]
    assert all("code" not in t for t in others), "public_state carries crew codes"


async def test_refused_helper_is_honest(game: Game):
    # Guard against a vacuous suite: a player RPC that should fail does fail.
    assert await refused(game.crews[0][0], "scan_qr", {"p_token": "not-a-real-token-at-all-000"}) == "BAD_QR"
