from fastapi.testclient import TestClient

from app.main import app
from app.models import EstimateRequest
from engine import estimate, finance
from engine.scenarios import CFG, new_price

api = TestClient(app)


def test_loan_and_lease_use_the_engine_math():
    e = estimate.estimate(EstimateRequest(models=["Camry"], down_payment=3000, term_months=60, credit_tier="A"))
    v = e.vehicles[0]
    msrp, source = new_price("Camry")
    cap = msrp + CFG["fees"]["dealer_doc"] - 3000
    assert v.msrp == msrp and v.msrp_source == source and v.apr == CFG["rates"]["new_vehicle"]["A"]
    assert v.loan_payment == round(finance.monthly_payment(cap, v.apr, 60), 2)
    assert v.lease_payment == round(finance.lease_payment(cap, msrp * 0.6, v.apr, 36), 2)
    assert v.true_cost.payment == v.loan_payment and v.five_year_cost > v.loan_payment * 60


def test_trade_in_equity_is_value_minus_payoff_and_lowers_the_payment():
    base = estimate.estimate(EstimateRequest(models=["RAV4"]))
    e = estimate.estimate(EstimateRequest(models=["RAV4"], trade_in={"model": "Camry", "year": 2021,
                                                                   "odometer_miles": 48000, "payoff": 9000}))
    t = e.trade_in
    assert t.equity == round(t.estimated_value - 9000, 2) and t.source and t.as_of
    assert (e.vehicles[0].loan_payment < base.vehicles[0].loan_payment) == (t.equity > 0)
    assert "equity" in e.assumptions[0]


def test_endpoint_prices_up_to_three_cars():
    r = api.post("/estimate", json={"models": ["Camry", "Prius", "bZ"]})
    assert r.status_code == 200 and [v["vehicle"]["model"] for v in r.json()["vehicles"]] == ["Camry", "Prius", "bZ"]
    assert api.post("/estimate", json={"models": ["Camry", "Prius", "bZ", "RAV4"]}).status_code == 422
    assert api.post("/estimate", json={"models": ["Camry"], "down_payment": -1}).status_code == 422


def test_lease_says_when_equity_exceeds_depreciation():
    e = estimate.estimate(EstimateRequest(models=["Camry"], down_payment=20000))
    v = e.vehicles[0]
    assert v.lease_payment == round(finance.lease_payment(v.residual, v.residual, v.apr, 36), 2)   # rent charge only
    assert any("would come back to you" in a for a in e.assumptions)
