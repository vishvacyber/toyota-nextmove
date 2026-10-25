import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Customer, OptionType, Overrides, ScenarioRequest
from engine import finance, scenarios
from sim.generator import customers_by_id, generate

O = OptionType


def run(cid, options=None, **overrides):
    req = ScenarioRequest(customer_id=cid, options=options, overrides=Overrides(**overrides) if overrides else None)
    return {s.option: s for s in scenarios.run(req, customers_by_id()[cid]).scenarios}


# ---------- personas ----------

def test_maria_buyout_beats_return():
    s = run("CUST-MARIA")
    buyout, ret = s[O.buyout], s[O.return_]
    assert ret.fees == 2450 + 350 + 400                     # overage + disposition + wear
    assert ret.equity == 0 and buyout.equity == scenarios.equity(customers_by_id()["CUST-MARIA"])
    assert buyout.equity - buyout.fees > ret.equity - ret.fees
    assert buyout.monthly_payment == pytest.approx(finance.monthly_payment(22450 + 300, 6.4, 60), abs=0.01)
    assert s[O.do_nothing].total_cost == ret.total_cost     # lease baseline = return at lease end
    assert O.keep not in s and O.refinance not in s and O.deferral not in s


def test_maria_lease_extend_adds_overage():
    ext = run("CUST-MARIA")[O.extend]
    assert ext.monthly_payment == 389 and ext.horizon_months == 6
    assert ext.fees > 0 and ext.total_cost == pytest.approx(389 * 6 + ext.fees, abs=0.01)


def test_buyout_overrides():
    base = run("CUST-MARIA")[O.buyout]
    down = run("CUST-MARIA", down_payment=5000, term_months=48, apr=4.0)[O.buyout]
    assert down.monthly_payment == pytest.approx(finance.monthly_payment(22750 - 5000, 4.0, 48), abs=0.01)
    assert down.total_cost == pytest.approx(down.monthly_payment * 48 + 5000, abs=0.5)
    assert down.monthly_payment < base.monthly_payment


def test_james_upgrade_lowers_monthly_cost():
    s = run("CUST-JAMES")
    keep, up = s[O.do_nothing], s[O.upgrade]
    assert keep.total_cost == 496 * 23
    assert up.target_vehicle.model == "Camry" and up.target_vehicle.powertrain == "hybrid"
    assert up.monthly_payment < keep.monthly_payment
    assert up.true_cost.total_monthly < keep.true_cost.total_monthly
    assert up.true_cost.co2_kg_per_year < keep.true_cost.co2_kg_per_year
    financed = 33500 + 650 - up.equity
    assert up.monthly_payment == pytest.approx(finance.monthly_payment(financed, 5.9, 60), abs=0.01)


def test_james_trade_in_and_refinance():
    s, c = run("CUST-JAMES"), customers_by_id()["CUST-JAMES"]
    assert s[O.trade_in].equity == scenarios.market_value(c.vehicle) - 10760
    assert s[O.trade_in].total_cost == 0
    assert s[O.refinance].monthly_payment == pytest.approx(finance.monthly_payment(10760, 5.4, 23), abs=0.01)
    assert s[O.refinance].monthly_payment < 496


def test_upgrade_target_override():
    up = run("CUST-JAMES", target_model="bZ")[O.upgrade]
    assert up.target_vehicle.model == "bZ" and up.target_vehicle.powertrain == "ev"


def test_priya_payment_stress():
    s = run("CUST-PRIYA")
    base = s[O.do_nothing]
    assert base.fees == 50 and base.total_cost == 468 * 17 + 50
    assert any("past due" in a for a in base.assumptions)
    assert s[O.due_date_change].label == "Move due date to the 17th"
    assert s[O.deferral].total_cost == pytest.approx(468 * 17 + finance.deferral_interest(468, 4.9, 17) + 50, abs=0.01)
    assert s[O.due_date_change].total_cost == 468 * 17 + 50
    # The $50 late fee is already owed, so every option carries it.
    assert all(x.fees >= 50 and any("late fee" in a for a in x.assumptions) for x in s.values())
    ext = s[O.extend]
    assert ext.monthly_payment < 468 and ext.horizon_months == 29
    assert O.refinance not in s and O.upgrade not in s and O.trade_in not in s   # not current


def test_situations_match_fixtures():
    for c in customers_by_id().values():
        if c.id in ("CUST-MARIA", "CUST-JAMES", "CUST-PRIYA"):
            assert scenarios.detect_situation(c) == c.situation


# ---------- eligibility ----------

def test_requested_ineligible_options_are_explained():
    s = run("CUST-PRIYA", options=[O.refinance, O.buyout, O.new_lease])
    assert all(not x.eligible and x.ineligible_reason for x in s.values())
    assert "current" in s[O.refinance].ineligible_reason or "rate" in s[O.refinance].ineligible_reason


def test_keep_only_listed_when_requested():
    assert O.keep not in run("CUST-JAMES")   # identical to the do_nothing baseline for loans
    keep, base = run("CUST-JAMES", options=[O.keep, O.do_nothing]).values()
    assert keep.eligible and (keep.monthly_payment, keep.total_cost) == (base.monthly_payment, base.total_cost)


def test_omitted_options_return_only_eligible_with_baseline_first():
    for cid in ["CUST-MARIA", "CUST-JAMES", "CUST-PRIYA"]:
        out = scenarios.run(ScenarioRequest(customer_id=cid), customers_by_id()[cid]).scenarios
        assert out[0].option == O.do_nothing
        assert all(x.eligible for x in out)


# ---------- generator ----------

def test_generator_is_deterministic_and_large():
    a, b = generate(), generate()
    assert len(a) >= 1000 and [c.model_dump() for c in a[:50]] == [c.model_dump() for c in b[:50]]
    assert {c.vehicle.model for c in a} == {"Camry", "RAV4", "Tacoma", "Highlander", "Prius", "bZ"}
    assert {c.contract.type for c in a} == {"lease", "loan"}
    assert len({c.id for c in a}) == len(a)


def test_no_protected_attributes():
    banned = {"age", "birth_date", "dob", "sex", "gender", "race", "ethnicity", "religion", "national_origin",
              "marital_status", "nationality"}
    assert not banned & set(Customer.model_fields)


def test_engine_runs_for_every_customer():
    for c in customers_by_id().values():
        for s in scenarios.run(ScenarioRequest(customer_id=c.id), c).scenarios:
            assert all(math.isfinite(x) for x in (s.monthly_payment, s.total_cost, s.equity, s.fees)), (c.id, s.option)
            assert s.monthly_payment >= 0 and s.fees >= 0


# ---------- API ----------

client = TestClient(app)


def test_post_scenarios():
    res = client.post("/scenarios", json={"customer_id": "CUST-JAMES"})
    assert res.status_code == 200
    body = res.json()
    assert body["customer_id"] == "CUST-JAMES" and body["as_of"].startswith("2026-10-24")
    assert any("as of" in a for a in body["assumptions"])        # market value source + time (CLAUDE.md rule 10)
    assert {s["option"] for s in body["scenarios"]} >= {"do_nothing", "upgrade", "trade_in"}


def test_post_scenarios_errors():
    assert client.post("/scenarios", json={"customer_id": "CUST-NOPE"}).status_code == 404
    bad = {"customer_id": "CUST-MARIA", "overrides": {"term_months": 0}}
    assert client.post("/scenarios", json=bad).status_code == 422
