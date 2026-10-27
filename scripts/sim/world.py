"""Builds a clean hunt on the TEST project for a bot run: empties every game table, deletes the accounts earlier bot
runs made, loads the real venue (59 places with areas and pins, 118 clue sets, the 321-question bank) and creates
a fresh admin account. Returns what the run needs to drive it.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from lib import ROOT, URL, Service, rand, retry, sign_in, tsx

# Children first (same order as integration/harness.ts).
WIPE = [
    ("scan_tickets", "player_id"),
    ("checkins", "player_id"),
    ("tasks", "id"),
    ("round_results", "team_id"),
    ("team_state", "team_id"),
    ("events", "id"),
    ("alerts", "id"),
    ("rate_limits", "subject"),
    ("assignments", "team_id"),
    ("qr_links", "from_qr"),
    ("qr_codes", "id"),
    ("rounds", "number"),
    ("players", "id"),
    ("teams", "id"),
    ("admin_audit", "id"),
    ("clue_sets", "location_id"),
    ("cards", "location_id"),
    ("locations", "id"),
    ("questions", "id"),
]
SIM_DOMAIN = "sim.cryptohunt.dev"
PLAYER_DOMAIN = "players.cryptohunt.app"


async def _delete_old_accounts(c: httpx.AsyncClient, s: Service) -> int:
    """Player accounts (made by the join function) and earlier bot-run admins. Test project only."""
    gone = 0
    page = 1
    doomed: list[str] = []
    while True:
        r = await retry(lambda: c.get(f"{URL}/auth/v1/admin/users?page={page}&per_page=1000", headers=s.h))
        r.raise_for_status()
        users = r.json().get("users", [])
        doomed += [u["id"] for u in users if (u.get("email") or "").endswith((f"@{SIM_DOMAIN}", f"@{PLAYER_DOMAIN}"))]
        if len(users) < 1000:
            break
        page += 1
    for i in range(0, len(doomed), 10):
        await asyncio.gather(*(s.delete_user(uid) for uid in doomed[i : i + 10]))
        gone += len(doomed[i : i + 10])
    return gone


async def build(c: httpx.AsyncClient, *, load_venue: bool = True) -> dict[str, Any]:
    s = Service(c)
    for table, col in WIPE:
        if not load_venue and table in ("clue_sets", "cards", "locations", "questions"):
            continue
        await s.delete(table, f"{col}=not.is.null")
    await s.delete("admins", "user_id=not.is.null")
    removed = await _delete_old_accounts(c, s)
    await s.update(
        "games",
        "id=eq.1",
        {
            "status": "SETUP",
            "registration_open": False,
            "hints_enabled": False,
            "paused_at": None,
            "broadcast": None,
            "broadcast_at": None,
            "started_at": None,
            "finished_at": None,
            "end_reason": None,
            "hint_penalty_ms": 60000,
            "wrong_penalty_ms": 60000,
        },
    )

    if load_venue:
        venue = tsx("scripts/sim/venue.mts", None)
        locs = await s.insert("locations", venue["places"])
        by_no = {l["place_no"]: l["id"] for l in locs}
        await s.insert(
            "clue_sets",
            [
                {"location_id": by_no[cl["place_no"]], "set_no": cl["set_no"], "pieces": cl["pieces"], "hint": cl["hint"]}
                for cl in venue["clues"]
            ],
        )
        await s.insert("questions", venue["questions"])
    await s.insert("venue_map", {"id": 1, "image_path": "campus-map.jpg", "width": 1800, "height": 792}, upsert=True)
    if (await c.get(f"{URL}/storage/v1/object/public/venue/campus-map.jpg")).status_code != 200:
        img = (ROOT / "docs" / "venue" / "campus-map.jpg").read_bytes()
        await retry(lambda: c.post(f"{URL}/storage/v1/object/venue/campus-map.jpg",
                                   headers={**s.h, "Content-Type": "image/jpeg", "x-upsert": "true"}, content=img))

    email = f"captain-{rand()}@{SIM_DOMAIN}"
    password = f"pw-{rand(24)}"
    uid = await s.create_user(email, password)
    await s.insert("admins", {"user_id": uid, "name": email})
    admin = await sign_in(c, email, password, "admin")
    return {"admin": admin, "admin_email": email, "admin_password": password, "removed_accounts": removed}


async def locations(s: Service) -> list[dict[str, Any]]:
    return await s.select("locations", "select=id,place_no,building,floor,name,notes,landmark,area,map_x,map_y&order=place_no")


async def make_plan(s: Service, team_ids: list[str], seed: int, **over: Any) -> dict[str, Any]:
    locs = await locations(s)
    return tsx(
        "scripts/sim/plan.mts",
        {
            "teamIds": team_ids,
            "locationIds": [l["id"] for l in locs],
            "seed": seed,
            "areas": {l["id"]: l["area"] for l in locs},
            "pins": {l["id"]: {"x": l["map_x"], "y": l["map_y"]} for l in locs if l["map_x"] is not None},
            **over,
        },
    )
