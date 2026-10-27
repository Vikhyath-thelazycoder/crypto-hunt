"""T-810: the rule checker on hand-made game logs. A clean log passes; each planted bug is caught."""

from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone

import pytest

from oracle import World, check

T0 = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)


def at(s: float) -> str:
    return (T0 + timedelta(seconds=s)).isoformat()


def clean() -> World:
    """Three crews, two rounds (X = 2, then the final). Iron Gulls takes a hint in round 1 (+1:00); Salt Wolves
    misses three times on a typed question (+1:00); Black Tide is slow and goes out in round 1; Iron Gulls wins.
    The admin pauses for 30 s while Iron Gulls serves its penalty, so its round counts 30 s later."""
    teams = [
        {"id": "A", "number": 1, "name": "Iron Gulls", "status": "finished", "eliminated_in_round": None, "final_rank": 1, "completion_key": "K1"},
        {"id": "B", "number": 2, "name": "Salt Wolves", "status": "eliminated", "eliminated_in_round": 2, "final_rank": None, "completion_key": None},
        {"id": "C", "number": 3, "name": "Black Tide", "status": "eliminated", "eliminated_in_round": 1, "final_rank": None, "completion_key": None},
    ]
    players = [{"id": f"{t}{k}", "team_id": t, "name": f"{t}{k}", "is_active": True} for t in "ABC" for k in range(2)]
    locs = {
        "L1": {"id": "L1", "place_no": 1, "building": "Main Engineering Block", "floor": "Ground floor", "name": "Desk", "notes": None, "landmark": None, "area": "Main Block"},
        "L2": {"id": "L2", "place_no": 2, "building": "Park", "floor": "Outdoor", "name": "Bench", "notes": None, "landmark": None, "area": "MBA area"},
        "L3": {"id": "L3", "place_no": 3, "building": "Main Engineering Block", "floor": "First floor", "name": "Lab", "notes": None, "landmark": None, "area": "Main Block"},
        "L4": {"id": "L4", "place_no": 4, "building": "Main Ground", "floor": "Outdoor", "name": "Goal", "notes": None, "landmark": None, "area": "North"},
    }
    qrs = [
        {"id": "Q1", "round": 1, "kind": "target", "location_id": "L1", "label": "R1-01", "is_spare": False},
        {"id": "Q2", "round": 1, "kind": "target", "location_id": "L3", "label": "R1-02", "is_spare": False},
        {"id": "Q3", "round": 2, "kind": "final", "location_id": "L2", "label": "F-01", "is_spare": False},
        {"id": "QC", "round": 1, "kind": "target", "location_id": "L4", "label": "R1-03", "is_spare": False},
    ]
    assignments = [
        {"team_id": "A", "round": 1, "qr_id": "Q1"}, {"team_id": "A", "round": 2, "qr_id": "Q3"},
        {"team_id": "B", "round": 1, "qr_id": "Q2"}, {"team_id": "B", "round": 2, "qr_id": "Q3"},
        {"team_id": "C", "round": 1, "qr_id": "QC"},
    ]

    def ci(p: str, r: int, q: str, s: float, final: bool = False):
        return {"player_id": p, "round": r, "qr_id": q, "scanned_at": at(s - 5), "key_ok_at": at(s), "seal_ok_at": at(s) if final else None}

    checkins = [
        ci("A0", 1, "Q1", 100), ci("A1", 1, "Q1", 110),  # A's round 1 counts at 110 + 60 (hint) + 30 (pause) = 200
        ci("B0", 1, "Q2", 150), ci("B1", 1, "Q2", 160),  # B's counts at 160 + 60 (3rd wrong) = 220
        ci("A0", 2, "Q3", 300, True), ci("A1", 2, "Q3", 310, True),
    ]
    tasks = [
        {"id": "tA", "team_id": "A", "round": 1, "question_id": "qt", "hint_used": True, "wrong_count": 0, "replaced_questions": []},
        {"id": "tB", "team_id": "B", "round": 1, "question_id": "qt2", "hint_used": False, "wrong_count": 3, "replaced_questions": []},
        {"id": "tB2", "team_id": "B", "round": 2, "question_id": "qm2", "hint_used": False, "wrong_count": 1, "replaced_questions": ["qm"]},
    ]
    events = [
        {"id": 1, "team_id": "A", "player_id": "A0", "kind": "hint", "data": {"round": 1}, "at": at(50)},
        {"id": 2, "team_id": "B", "player_id": "B0", "kind": "wrong_penalty", "data": {"round": 1}, "at": at(60)},
        {"id": 3, "team_id": "A", "player_id": None, "kind": "penalty_started", "data": {"ms": 60000}, "at": at(110)},
        {"id": 4, "team_id": None, "player_id": None, "kind": "paused", "data": {}, "at": at(120)},
        {"id": 5, "team_id": None, "player_id": None, "kind": "resumed", "data": {}, "at": at(150)},
        {"id": 6, "team_id": "B", "player_id": None, "kind": "penalty_started", "data": {"ms": 60000}, "at": at(160)},
    ]
    return World(
        games={"status": "FINISHED", "hint_penalty_ms": 60000, "wrong_penalty_ms": 60000, "finished_at": at(310)},
        rounds=[
            {"number": 1, "advance_count": 2, "is_final": False, "closed_at": at(220)},
            {"number": 2, "advance_count": 1, "is_final": True, "closed_at": at(310)},
        ],
        teams=teams,
        players=players,
        round_results=[
            {"team_id": "A", "round": 1, "completed_at": at(200), "completion_order": 1},
            {"team_id": "B", "round": 1, "completed_at": at(220), "completion_order": 2},
            {"team_id": "A", "round": 2, "completed_at": at(310), "completion_order": 1},
        ],
        tasks=tasks,
        questions={"qt": {"id": "qt", "format": "text", "hint": "h"}, "qt2": {"id": "qt2", "format": "text", "hint": "h"},
                   "qm": {"id": "qm", "format": "mcq", "hint": None}, "qm2": {"id": "qm2", "format": "mcq", "hint": None}},
        checkins=checkins,
        events=events,
        qr_codes=qrs,
        assignments=assignments,
        locations=locs,
        venue=[{k: v for k, v in l.items() if k not in ("id", "area")} for l in locs.values()],
    )


def rules(w: World) -> set[str]:
    return {f.rule for f in check(w)}


def test_clean_log_passes():
    assert check(clean()) == []


def test_hint_costing_two_minutes_is_caught():
    w = clean()
    w.round_results[0]["completed_at"] = at(260)  # 110 + 120 + 30
    w.round_results[0], w.round_results[1] = w.round_results[0], w.round_results[1]
    w.round_results[1]["completed_at"] = at(270)  # keep B after A so only the penalty rule trips
    w.checkins[3]["key_ok_at"] = at(210)
    assert "penalty served" in rules(w)


def test_third_wrong_answer_not_penalised_is_caught():
    w = clean()
    w.round_results[1]["completed_at"] = at(160)  # B's 3rd miss forgotten
    w.round_results[0]["completed_at"] = at(155)
    w.checkins[1]["key_ok_at"] = at(65)
    w.checkins[0]["key_ok_at"] = at(60)
    assert "penalty served" in rules(w)


def test_pause_not_freezing_the_penalty_is_caught():
    w = clean()
    w.round_results[0]["completed_at"] = at(170)  # 110 + 60, ignoring the 30 s pause
    assert "penalty served" in rules(w)


def test_x_plus_one_advancing_is_caught():
    w = clean()
    w.round_results.append({"team_id": "C", "round": 1, "completed_at": at(215), "completion_order": 3})
    assert "elimination" in rules(w)


def test_crew_left_racing_after_its_round_closed_is_caught():
    w = clean()
    w.teams[2].update(status="active", eliminated_in_round=None)
    w.games["status"] = "RUNNING"
    assert "elimination" in rules(w)


def test_wrong_out_round_is_caught():
    w = clean()
    w.teams[2]["eliminated_in_round"] = 2
    assert "elimination" in rules(w)


def test_round_left_open_after_a_later_one_closed_is_caught():
    w = clean()
    w.rounds[0]["closed_at"] = None
    assert "elimination" in rules(w)


def test_tie_at_x_with_one_too_many_is_caught():
    w = clean()
    # Two crews in the same second at the last slot: both counted.
    w.round_results.append({"team_id": "C", "round": 1, "completed_at": at(220), "completion_order": 3})
    assert "elimination" in rules(w)


def test_completion_order_against_time_is_caught():
    w = clean()
    w.round_results[0]["completed_at"], w.round_results[1]["completed_at"] = at(225), at(220)
    w.checkins[1]["key_ok_at"] = at(135)
    assert "finish order" in rules(w)


def test_hint_on_multiple_choice_is_caught():
    w = clean()
    w.tasks[2]["hint_used"] = True
    assert "hint penalty" in rules(w)


def test_swapped_question_coming_back_is_caught():
    w = clean()
    w.tasks[1]["question_id"] = "qm"
    assert "multiple choice" in rules(w)


def test_checkin_on_another_crews_mark_is_caught():
    w = clean()
    w.checkins[2]["qr_id"] = "Q1"
    assert "round lock" in rules(w)


def test_final_without_seal_is_caught():
    w = clean()
    w.checkins[4]["seal_ok_at"] = None
    assert "finish" in rules(w)


def test_route_in_one_area_is_caught():
    w = clean()
    w.qr_codes[2]["location_id"] = "L3"  # final in the Main Block, after a Main Block round 1
    w.venue = copy.deepcopy(w.venue)
    assert "routes far apart" in rules(w)


def test_card_stub_not_matching_the_venue_list_is_caught():
    w = clean()
    w.locations["L1"]["floor"] = "Second floor"
    assert "print cards" in rules(w)


def test_podium_not_first_final_checkins_is_caught():
    w = clean()
    w.teams[0]["final_rank"] = 2
    assert "finish" in rules(w)


@pytest.mark.parametrize("hint_ms", [120000, 30000])
def test_penalty_length_setting_is_caught(hint_ms: int):
    w = clean()
    w.games["hint_penalty_ms"] = hint_ms
    assert "penalty" in rules(w)
