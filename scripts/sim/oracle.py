"""T-810 rule checker: after a run, rebuild the hunt from the database and re-check every rule with its own code
(never the game's). Reads with the service role on the TEST project; the checks themselves are pure functions over a
`World` (plain lists of rows), so pytest can feed them hand-made logs with planted bugs (test_oracle.py).

Rules (IMPLEMENTATION_PLAN › P8 › Rules every run checks): elimination and X (D-012), ties at X (T9), hint and
wrong-answer penalties (D-041), penalty served at check-in with pause freezing it (D-013), penalty vs finish order,
round lock (D-025), multiple choice (no hints, swapped questions never return, D-029), routes far apart (D-042),
print cards vs the venue list (D-031, D-043), the finish (D-026, D-040).
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from lib import ms

MINUTE = 60_000
SLACK = 2_500  # ms: clock rounding and the time between two statements in one transaction


@dataclass
class World:
    games: dict[str, Any]
    rounds: list[dict[str, Any]]
    teams: list[dict[str, Any]]
    players: list[dict[str, Any]]
    round_results: list[dict[str, Any]]
    tasks: list[dict[str, Any]]
    questions: dict[str, dict[str, Any]]
    checkins: list[dict[str, Any]]
    events: list[dict[str, Any]]
    qr_codes: list[dict[str, Any]]
    assignments: list[dict[str, Any]]
    locations: dict[str, dict[str, Any]]
    venue: list[dict[str, Any]] = field(default_factory=list)  # docs/venue/locations.md rows, by place_no


@dataclass
class Finding:
    rule: str
    detail: str
    crew: str | None = None
    round: int | None = None
    expected: Any = None
    actual: Any = None

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v is not None}


async def load(svc: Any) -> World:
    """Everything the checks need, read back with the service role."""
    sel = svc.select
    games = (await sel("games", "select=*"))[0]
    qs = await sel("questions", "select=id,format,hint")
    locs = await sel("locations", "select=id,place_no,building,floor,name,notes,landmark,area")
    from lib import tsx

    venue = tsx("scripts/sim/venue.mts", None)["places"]
    return World(
        games=games,
        rounds=await sel("rounds", "select=*&order=number"),
        teams=await sel("teams", "select=id,number,name,status,eliminated_in_round,final_rank,completion_key"),
        players=await sel("players", "select=id,team_id,name,is_active"),
        round_results=await sel("round_results", "select=*"),
        tasks=await sel("tasks", "select=*"),
        questions={q["id"]: q for q in qs},
        checkins=await sel("checkins", "select=*"),
        events=await sel("events", "select=id,team_id,player_id,kind,data,at&order=id"),
        qr_codes=await sel("qr_codes", "select=id,round,kind,location_id,label,is_spare"),
        assignments=await sel("assignments", "select=*"),
        locations={l["id"]: l for l in locs},
        venue=venue,
    )


def pauses(w: World) -> list[tuple[float, float]]:
    """Pause intervals from the paused / resumed events (an unresumed pause runs to the game's end)."""
    out: list[tuple[float, float]] = []
    start: float | None = None
    for e in w.events:
        if e["kind"] == "paused":
            start = ms(e["at"])
        elif e["kind"] == "resumed" and start is not None:
            out.append((start, ms(e["at"])))  # type: ignore[arg-type]
            start = None
    if start is not None:
        out.append((start, ms(w.games.get("finished_at")) or float("inf")))
    return out


def overlap(a: float, b: float, spans: list[tuple[float, float]]) -> float:
    return sum(max(0.0, min(b, e) - max(a, s)) for s, e in spans)


def check(w: World) -> list[Finding]:
    f: list[Finding] = []
    name = {t["id"]: t["name"] for t in w.teams}
    team = {t["id"]: t for t in w.teams}
    rounds = {r["number"]: r for r in w.rounds}
    results: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for r in w.round_results:
        results[r["round"]].append(r)
    done = {(r["team_id"], r["round"]) for r in w.round_results}
    finished_game = w.games["status"] == "FINISHED"
    ended_by_admin = any(e["kind"] == "game_ended" and (e["data"] or {}).get("reason") not in (None, "podium", "finished", "top3")
                         for e in w.events)

    # ── Elimination and X (D-012), ties at X (T9) ───────────────────────────────────────────────────
    for n, rd in rounds.items():
        got = sorted(results[n], key=lambda r: r["completion_order"])
        x = rd["advance_count"]
        orders = [r["completion_order"] for r in got]
        if orders != list(range(1, len(got) + 1)):
            f.append(Finding("elimination", "completion orders are not 1, 2, 3 … without gaps", round=n, actual=orders))
        if len(got) > x:
            f.append(Finding("elimination", "more crews completed the round than X", round=n, expected=x, actual=len(got)))
        later_close = [ms(o["closed_at"]) for m, o in rounds.items() if m > n and o["closed_at"]]
        if rd["closed_at"] and len(got) != x and not rd["is_final"]:
            # Allowed only when a later round filled first and closed this one with it (the crews left are hopeless).
            if not any(abs(ms(rd["closed_at"]) - c) <= SLACK for c in later_close):  # type: ignore[operator]
                f.append(Finding("elimination", "a closed round does not have exactly X completions", round=n, expected=x, actual=len(got)))
        if not rd["closed_at"] and later_close:
            f.append(Finding("elimination", "a round was left open after a later round closed (projector and dashboard show the wrong round)",
                             round=n, expected="closed with the later round", actual="open"))
        if rd["closed_at"]:
            closed = ms(rd["closed_at"])
            for r in got:
                if ms(r["completed_at"]) > closed + SLACK:  # type: ignore[operator]
                    f.append(Finding("elimination", "a crew completed after the round closed", crew=name.get(r["team_id"]), round=n))
            # Every crew that had not completed round n when it closed is out (crews still in earlier rounds too).
            if not rd["is_final"]:
                for t in w.teams:
                    if (t["id"], n) not in done and t["status"] not in ("eliminated", "disqualified"):
                        f.append(Finding("elimination", "a crew that did not complete a closed round is still racing", crew=t["name"], round=n))
        # Finish order follows the time each crew's round counted (check-in + penalty), ties allowed.
        times = [ms(r["completed_at"]) for r in got]
        # Crews in the same second are a tie: either order is fair (T9). A later slot more than a second behind
        # an earlier time means a penalty that ran out was counted late.
        if any(b < a - 1000 for a, b in zip(times, times[1:])):  # type: ignore[operator]
            f.append(Finding("finish order", "completion order does not follow completion time (penalty overtaking broken)", round=n))
    for t in w.teams:
        rs = sorted(r for (tid, r) in done if tid == t["id"])
        if rs != list(range(1, len(rs) + 1)):
            f.append(Finding("elimination", "a crew completed a later round without the earlier one", crew=t["name"], actual=rs))
        if t["status"] == "eliminated" and t["eliminated_in_round"] != len(rs) + 1:
            f.append(Finding("elimination", "'out in round N' is not the round the crew was in", crew=t["name"],
                             expected=len(rs) + 1, actual=t["eliminated_in_round"]))

    # ── Penalties (D-041) and serving them (D-013) ───────────────────────────────────────────────────
    hints: Counter[tuple[str, int]] = Counter()
    for e in w.events:
        if e["kind"] == "hint":
            hints[(e["team_id"], (e["data"] or {}).get("round"))] += 1
    wrongs: dict[tuple[str, int], int] = defaultdict(int)
    for tk in w.tasks:
        wrongs[(tk["team_id"], tk["round"])] += (tk.get("wrong_count") or 0) // 3
        q = w.questions.get(tk.get("question_id") or "")
        if tk.get("hint_used") and q and q["format"] == "mcq":
            f.append(Finding("hint penalty", "a hint was used on a multiple-choice question", crew=name.get(tk["team_id"]), round=tk["round"]))
    hint_ms = w.games.get("hint_penalty_ms", MINUTE)
    wrong_ms = w.games.get("wrong_penalty_ms", MINUTE)
    if hint_ms != MINUTE or wrong_ms != MINUTE:
        f.append(Finding("penalty", "penalties are not one minute (D-041)", expected=MINUTE, actual=[hint_ms, wrong_ms]))
    started = {(e["team_id"], e["data"].get("ms")) for e in w.events if e["kind"] == "penalty_started"}
    by_team_round_checkins: dict[tuple[str, int], list[float]] = defaultdict(list)
    pteam = {p["id"]: p["team_id"] for p in w.players}
    for c in w.checkins:
        if c.get("key_ok_at") and c["player_id"] in pteam:
            by_team_round_checkins[(pteam[c["player_id"]], c["round"])].append(ms(c["key_ok_at"]))  # type: ignore[arg-type]
    spans = pauses(w)
    for r in w.round_results:
        key = (r["team_id"], r["round"])
        expect = MINUTE * hints[key] + MINUTE * wrongs[key]
        cin = by_team_round_checkins.get(key)
        if not cin:
            continue  # completed by the admin (force_complete) or a member was removed after checking in
        last = max(cin)
        done_at = ms(r["completed_at"])
        served = done_at - last - overlap(last, done_at, spans)  # type: ignore[operator]
        if abs(served - expect) > SLACK:
            f.append(Finding("penalty served", "the round counted at the wrong time after check-in", crew=name.get(r["team_id"]),
                             round=r["round"], expected=f"{expect / 1000:.0f}s (hints {hints[key]}, 3rd wrongs {wrongs[key]})",
                             actual=f"{served / 1000:.1f}s"))
        if expect and (r["team_id"], expect) not in started:
            f.append(Finding("penalty", "no penalty_started event with the expected length", crew=name.get(r["team_id"]), round=r["round"], expected=expect))

    # ── Multiple choice (D-029): a swapped-out question never comes back to the crew ─────────────────
    held: dict[str, set[str]] = defaultdict(set)
    gone: dict[str, set[str]] = defaultdict(set)
    for tk in w.tasks:
        if tk.get("question_id"):
            held[tk["team_id"]].add(tk["question_id"])
        for q in tk.get("replaced_questions") or []:
            gone[tk["team_id"]].add(q)
    for t, qs in gone.items():
        back = qs & held[t]
        if back:
            f.append(Finding("multiple choice", "a swapped-out question came back to the crew", crew=name.get(t), actual=len(back)))

    # ── Round lock (D-025): every check-in is the crew's own mark for that round ─────────────────────
    assigned = {(a["team_id"], a["round"]): a["qr_id"] for a in w.assignments}
    qr = {q["id"]: q for q in w.qr_codes}
    for c in w.checkins:
        if not c.get("key_ok_at") or c["player_id"] not in pteam:
            continue
        t = pteam[c["player_id"]]
        if assigned.get((t, c["round"])) != c["qr_id"]:
            f.append(Finding("round lock", "a check-in counted on a mark that is not the crew's for that round", crew=name.get(t), round=c["round"]))
        q = qr.get(c["qr_id"])
        if q and q["round"] != c["round"]:
            f.append(Finding("round lock", "a check-in counted on another round's mark", crew=name.get(t), round=c["round"], actual=q["round"]))
        if q and q["kind"] == "final" and not c.get("seal_ok_at"):
            f.append(Finding("finish", "a final check-in without the seal code", crew=name.get(t)))

    # ── Routes far apart (D-042) ─────────────────────────────────────────────────────────────────────
    area = {q["id"]: (w.locations.get(q["location_id"] or "") or {}).get("area") for q in w.qr_codes}
    route: dict[str, dict[int, str]] = defaultdict(dict)
    for a in w.assignments:
        route[a["team_id"]][a["round"]] = a["qr_id"]
    for t, rs in route.items():
        for n in sorted(rs):
            if n + 1 in rs and area.get(rs[n]) and area.get(rs[n]) == area.get(rs[n + 1]):
                f.append(Finding("routes far apart", "two consecutive places in the same area", crew=name.get(t), round=n, actual=area.get(rs[n])))

    # ── Print cards (D-031, D-043): every mark's place matches the venue list ───────────────────────
    by_no = {v["place_no"]: v for v in w.venue}
    for q in w.qr_codes:
        if q["kind"] == "universal" or not q["location_id"]:
            continue
        l = w.locations.get(q["location_id"])
        v = by_no.get((l or {}).get("place_no"))
        if not l or not v:
            f.append(Finding("print cards", "a mark's place is not in docs/venue/locations.md", actual=q["label"]))
            continue
        for k in ("building", "floor", "name", "notes", "landmark"):
            if (l.get(k) or None) != (v.get(k) or None):
                f.append(Finding("print cards", f"place #{v['place_no']} {k} differs from docs/venue/locations.md", actual=l.get(k), expected=v.get(k)))

    # ── Finish (D-026, D-040) ────────────────────────────────────────────────────────────────────────
    final = next((r for r in w.rounds if r["is_final"]), None)
    if final:
        podium = sorted(results[final["number"]], key=lambda r: r["completion_order"])[:3]
        for i, r in enumerate(podium, 1):
            t = team[r["team_id"]]
            if t["status"] != "finished" or t["final_rank"] != i:
                f.append(Finding("finish", "the podium is not the first three final check-ins", crew=t["name"], expected=i, actual=t["final_rank"]))
        keys = [t["completion_key"] for t in w.teams if t["status"] == "finished"]
        if any(not k for k in keys) or len(set(keys)) != len(keys):
            f.append(Finding("finish", "finished crews need unique completion keys"))
        winners = sum(1 for t in w.teams if t["status"] == "finished")
        if winners > 3:
            f.append(Finding("finish", "more than three crews finished", actual=winners))
        if winners == min(3, final["advance_count"]) and not finished_game:
            f.append(Finding("finish", "three crews finished but the game is not over"))
        if finished_game and not ended_by_admin and winners < min(3, final["advance_count"]) and any(t["status"] == "active" for t in w.teams):
            f.append(Finding("finish", "the game ended while crews were still racing for the podium"))
    return f


def usage(w: World) -> dict[str, int]:
    """Which rules the run actually exercised (a rule never used proves nothing)."""
    kinds = Counter(e["kind"] for e in w.events)
    return {
        "hints": kinds["hint"],
        "wrong answers (typed)": kinds["wrong_answer"],
        "multiple-choice swaps": kinds["mcq_swapped"],
        "wrong-answer penalties": kinds["wrong_penalty"],
        "penalties served": kinds["penalty_started"],
        "eliminations": sum(1 for t in w.teams if t["status"] == "eliminated"),
        "rounds closed": sum(1 for r in w.rounds if r["closed_at"]),
        "pauses": kinds["paused"],
        "crews finished": sum(1 for t in w.teams if t["status"] == "finished"),
        "ties (completions in the same second of one round)": sum(
            c - 1 for c in Counter((x["round"], x["completed_at"][:19]) for x in w.round_results).values() if c > 1
        ),
    }


if __name__ == "__main__":
    import asyncio

    from lib import Service, http

    async def main() -> int:
        async with http(60) as c:
            w = await load(Service(c))
        found = check(w)
        print(json.dumps({"findings": [x.as_dict() for x in found], "used": usage(w)}, indent=2, default=str))
        return 1 if found else 0

    sys.exit(asyncio.run(main()))
