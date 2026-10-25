"""B4: timing optimizer, true cost + CO2, photo inspection (vision mocked), deal packets, NBA scoring."""

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agents import guardian, recommend, sdk, sentinel, vision
from app.main import app
from app.models import OptionType, Overrides, ScenarioRequest
from engine import nba, scenarios, timing
from tools import actions
from tools.customer import customer

PERSONAS = ["CUST-VISHWAA2026", "CUST-SAMEERA2026", "CUST-HUNG2026"]
PNG = b"\x89PNG\r\n\x1a\nfake"


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    monkeypatch.setattr(scenarios, "WEAR", {})
    monkeypatch.setitem(actions.STORE, "inspections", [])
    monkeypatch.setitem(actions.STORE, "deal_packets", [])


# ---- timing ----

@pytest.mark.parametrize("cid", PERSONAS)
def test_acting_now_beats_waiting_for_every_persona(cid):
    t = timing.timing(customer(cid))
    assert [m.month_offset for m in t.months] == list(range(7))
    assert t.best_month_offset == 0 and t.act_now_vs_wait_3 > 0
    assert t.act_now_vs_wait_3 == round(t.months[0].net_position - t.months[3].net_position, 2)
    assert "Acting now is worth about" in t.summary


def test_lease_fees_start_after_maturity_and_loan_late_fees_grow():
    vishwaa = timing.timing(customer("CUST-VISHWAA2026")).months   # lease ends in 90 days
    assert all(m.fees == 0 for m in vishwaa[:4]) and 0 < vishwaa[4].fees < vishwaa[5].fees < vishwaa[6].fees
    hung = timing.timing(customer("CUST-HUNG2026")).months   # past due: another $50 every month unresolved
    assert [m.fees for m in hung] == [50 * (1 + i) for i in range(7)]


def test_loan_waiting_costs_depreciation_plus_interest():
    t = timing.timing(customer("CUST-SAMEERA2026"))
    assert t.months[3].equity > t.months[0].equity           # paying down the loan builds equity...
    assert t.months[3].net_position < t.months[0].net_position   # ...but with their own payments
    assert "value loss" in t.summary and "interest" in t.summary


def test_months_from_now_matches_timing_rows():
    c = customer("CUST-SAMEERA2026")
    ss = scenarios.run(ScenarioRequest(customer_id=c.id, options=[OptionType.keep], overrides=Overrides(months_from_now=3)), c)
    assert ss.scenarios[0].equity == timing.timing(c).months[3].equity
    assert ss.scenarios[0].horizon_months == scenarios.remaining_months(c) - 3
    assert any("Projected 3 months from now" in a for a in ss.assumptions)
    assert scenarios.AHEAD.get() == 0   # context restored


def test_timing_endpoint_and_bad_months_from_now():
    client = TestClient(app)
    assert client.get("/customers/CUST-SAMEERA2026/timing").json()["best_month_offset"] == 0
    assert client.get("/customers/NOPE/timing").status_code == 404
    bad = {"customer_id": "CUST-SAMEERA2026", "overrides": {"months_from_now": -1}}
    assert client.post("/scenarios", json=bad).status_code == 422


# ---- true cost + CO2 ----

@pytest.mark.parametrize("cid", PERSONAS)
def test_true_cost_on_every_option_that_keeps_a_car(cid):
    c = customer(cid)
    no_car = {OptionType.return_, OptionType.trade_in} | ({OptionType.do_nothing} if c.contract.type == "lease" else set())
    for s in scenarios.run(ScenarioRequest(customer_id=cid), c).scenarios:
        assert (s.true_cost is not None) == (s.option not in no_car), s.option
        if s.true_cost:
            t = s.true_cost
            assert t.total_monthly == pytest.approx(t.payment + t.fuel + t.maintenance + t.insurance, abs=0.02)


def test_upgrade_states_co2_saved():
    c = customer("CUST-SAMEERA2026")
    ss = scenarios.run(ScenarioRequest(customer_id=c.id, options=[OptionType.upgrade, OptionType.keep]), c)
    up, keep = ss.scenarios
    saved = keep.true_cost.co2_kg_per_year - up.true_cost.co2_kg_per_year
    assert saved > 0 and f"Saves {saved:,.0f} kg CO2/year vs your current Camry" in up.assumptions


# ---- inspection ----

def fake_vision(text=None, exc=None):
    async def run(system, prompt, names, timeout=60, max_turns=8):
        assert names == [] and max_turns == 1 and any(b["type"] == "image" for b in prompt)
        if exc:
            raise exc
        return sdk.Run(text=text, model="fake-vision")
    return run


GOOD = json.dumps([{"angle": "front", "area": "front_bumper", "issue": "Scuff", "severity": "moderate", "box": [0.1, 0.5, 0.3, 0.2]},
                   {"angle": "rear", "area": "door", "position": "rear_left", "issue": "Small dent", "severity": "minor"},
                   {"angle": "rear", "area": "tire", "issue": "Fine", "severity": "none"}])


def post(cid="CUST-VISHWAA2026", n=2, angles=("front", "rear"), ctype="image/png", data=PNG):
    files = [("photos", (f"{i}.png", data, ctype)) for i in range(n)]
    return TestClient(app).post("/inspections", data={"customer_id": cid, "angles": list(angles)}, files=files)


def test_vision_items_are_charged_from_the_engine_table(monkeypatch):
    monkeypatch.setattr(sdk, "run", fake_vision(GOOD))
    r = post().json()
    ch = scenarios.CFG["inspection"]["charges"]
    assert [i["area"] for i in r["items"]] == ["Front bumper", "Rear left door"]   # "none" severity dropped
    assert [i["estimated_charge"] for i in r["items"]] == [ch["front_bumper"]["moderate"], ch["door"]["minor"]]
    assert r["total_estimated_charge"] == 450 and r["is_estimate"] is True and "Estimate" in r["disclaimer"]
    assert scenarios.WEAR["CUST-VISHWAA2026"] == 450
    ret = scenarios.run(ScenarioRequest(customer_id="CUST-VISHWAA2026", options=[OptionType.return_]), customer("CUST-VISHWAA2026"))
    assert ret.scenarios[0].fees == 2450 + 350 + 450 and any("photo pre-inspection" in a for a in ret.scenarios[0].assumptions)


@pytest.mark.parametrize("text", [
    json.dumps([{"angle": "front", "area": "hood", "issue": "Dent", "severity": "minor", "estimated_charge": 99}]),
    json.dumps([{"angle": "front", "area": "hood", "issue": "Dent, about $200 to fix", "severity": "minor"}]),
    json.dumps([{"angle": "front", "area": "hood", "issue": "Dent", "severity": "minor", "cost_usd": "cheap"}]),
    json.dumps([{"angle": "front", "area": "spoiler", "issue": "Dent", "severity": "minor"}]),
    json.dumps([{"angle": "wheels", "area": "hood", "issue": "Dent", "severity": "minor"}]),   # angle not photographed
    json.dumps([{"angle": "front", "area": "hood", "issue": "Dent", "severity": "minor", "box": [0, 0, 2, 1]}]),
    "Sure! Here is the damage: a dent.",
])
def test_bad_or_money_output_is_rejected(text):
    with pytest.raises(vision.Rejected):
        vision.parse(text, ["front", "rear"])


def test_money_output_is_busy_not_canned(monkeypatch):
    # AI only: a rejected model answer is traced as blocked and the app is told to retry (503), never shown canned items.
    monkeypatch.setattr(sdk, "run", fake_vision('[{"angle": "front", "area": "hood", "issue": "Dent", '
                                                '"severity": "minor", "price": 300}]'))
    r = post()
    assert r.status_code == 503 and "try again" in r.json()["detail"]
    from agents import traces
    t = traces.MEMORY[-1]
    assert t.agent.root == "inspector" and t.guardian.verdict.value == "block" and t.action.status.value == "blocked"


def test_timeout_is_busy(monkeypatch):
    monkeypatch.setattr(sdk, "run", fake_vision(exc=sdk.SdkUnavailable("TimeoutError")))
    with pytest.raises(sdk.Busy):
        asyncio.run(vision.inspect("CUST-SAMEERA2026", [("front", "image/png", PNG)]))
    assert "CUST-SAMEERA2026" not in scenarios.WEAR


def test_only_the_result_is_stored_never_the_photo(monkeypatch):
    monkeypatch.setattr(sdk, "run", fake_vision(GOOD))
    post()
    assert PNG not in json.dumps([r.model_dump(mode="json") for r in actions.STORE["inspections"]]).encode()
    from agents import traces
    assert "image" not in traces.MEMORY[-1].model_dump_json()
    latest = actions.inspect_photos(actions.InspectionIn(customer_id="CUST-VISHWAA2026"))
    assert latest.total_estimated_charge == 450   # the tool returns the latest pre-inspection


@pytest.mark.parametrize("kw,code", [({"ctype": "text/plain"}, 422), ({"n": 7, "angles": ["front"] * 7}, 422),
                                     ({"angles": ["front"]}, 422), ({"cid": "NOPE"}, 404),
                                     ({"data": b"x" * 5_000_001}, 422)])
def test_bad_uploads(monkeypatch, kw, code):
    monkeypatch.setattr(sdk, "run", fake_vision(GOOD))
    assert post(**kw).status_code == code


# ---- deal packets ----

def test_sameera_upgrade_deal_packet():
    client = TestClient(app)
    res = client.post("/deal-packets", json={"customer_id": "CUST-SAMEERA2026", "option": "upgrade"})
    assert res.status_code == 201
    p = res.json()
    assert p["status"] == "sent" and p["target_vehicle"]["model"] == "Camry" and p["target_vehicle"]["powertrain"] == "hybrid"
    assert p["vehicle"]["vin"] == customer("CUST-SAMEERA2026").vehicle.vin and p["dealer"]["name"]
    assert p["scenario"]["option"] == "upgrade" and p["scenario"]["true_cost"]
    assert p["eligibility"][0] == "Upgrade: every eligibility rule passed"
    assert client.get("/deal-packets").json()[0]["id"] == p["id"]
    assert actions.STORE["audit"][-1].action.startswith(f"send_deal_packet {p['id']}")


def test_deal_packet_errors():
    client = TestClient(app)
    assert client.post("/deal-packets", json={"customer_id": "CUST-SAMEERA2026", "option": "buyout"}).status_code == 422
    assert client.post("/deal-packets", json={"customer_id": "CUST-SAMEERA2026", "option": "upgrade",
                                              "dealer_id": "nope"}).status_code == 404
    assert client.post("/deal-packets", json={"customer_id": "NOPE", "option": "upgrade"}).status_code == 404


# ---- NBA scoring ----

def test_nba_is_deterministic_bounded_and_explained():
    for cid in PERSONAS:
        c = customer(cid)
        rec = recommend.pick(c.situation, recommend.scenario_set(c))
        a, b = nba.score(c, rec), nba.score(c, rec)
        assert a == b and 0.05 <= a["retention_odds"] <= 0.95 and a["expected_value"] > 0
        assert set(a["drivers"]) == {"situation", "equity", "on_time", "past_due", "action"}


def test_nba_rises_with_equity_and_falls_with_past_due():
    c = customer("CUST-SAMEERA2026")
    s = recommend.pick(c.situation, recommend.scenario_set(c))
    more = c.model_copy(update={"contract": c.contract.model_copy(update={"payoff_amount": 5000})})
    late = c.model_copy(update={"contract": c.contract.model_copy(update={"days_past_due": 45})})
    assert nba.score(more, s)["retention_odds"] >= nba.score(c, s)["retention_odds"] > nba.score(late, s)["retention_odds"]


def test_nba_uses_no_protected_or_credit_inputs():
    src = Path(nba.__file__).read_text() + json.dumps(scenarios.CFG["nba"])
    for word in ("age", "sex", "gender", "race", "religion", "national", "credit_tier", "region", "language"):
        assert f'"{word}' not in src and f".{word}" not in src


def test_opportunities_use_nba_and_reasons_pass_guardian():
    opps = {o.customer_id: o for o in sentinel.scan()}
    for cid in PERSONAS:
        o, c = opps[cid], customer(cid)
        rec = recommend.pick(c.situation, recommend.scenario_set(c))
        s = nba.score(c, rec)
        assert (o.expected_value, o.retention_odds) == (s["expected_value"], s["retention_odds"])
        v, _ = guardian.check(f"{o.script}. {o.reason}. {guardian.DISCLOSURE}", [("run_scenario", recommend.scenario_set(c).model_dump(mode="json")),
                                                            ("engine_facts", scenarios.facts(c))])
        assert v.verdict.value == "pass", (cid, v)
    assert opps["CUST-HUNG2026"].expected_value > 0 and opps["CUST-SAMEERA2026"].next_best_action == OptionType.upgrade
