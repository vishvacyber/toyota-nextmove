"""Next-best-action $ scoring for the console queue. Deterministic and explainable: every weight is in config `[nba]`,
every input comes from the engine or the contract, and no protected attribute (or credit tier) is used (rule 4)."""

import math

from app.models import Customer, Scenario
from engine import scenarios
from engine.scenarios import CFG


def features(c: Customer) -> dict[str, float]:
    hist = c.payment_history
    return {"equity_per_10k": scenarios.equity(c) / 10_000,
            "on_time": sum(p.status == "paid" for p in hist) / len(hist) if hist else 1.0,
            "past_due_per_30_days": c.contract.days_past_due / 30}


def score(c: Customer, s: Scenario) -> dict:
    """{expected_value, retention_odds, drivers}: drivers are each term's contribution, so the console can explain it."""
    n, f, opt = CFG["nba"], features(c), s.option.value
    drivers = {"situation": n["intercept"].get(c.situation.value, 0.0),
               "equity": n["w_equity_per_10k"] * f["equity_per_10k"],
               "on_time": n["w_on_time"] * f["on_time"],
               "past_due": n["w_past_due_per_30_days"] * f["past_due_per_30_days"],
               "action": n["w_action"].get(opt, 0.0)}
    odds = min(max(1 / (1 + math.exp(-sum(drivers.values()))), n["min_odds"]), n["max_odds"])
    margin = n["margin_rate"] * s.monthly_payment * (s.horizon_months or 0) if s.monthly_payment else \
        n["no_payment_value"].get(opt, 0)
    avoided = c.contract.payoff_amount * n["cure_lift"].get(opt, 0) * n["loss_given_default"] \
        if scenarios.payment_stress(c) else 0
    return {"expected_value": round(odds * margin + avoided), "retention_odds": round(odds, 2),
            "drivers": {k: round(v, 3) for k, v in drivers.items()}, "margin": round(margin), "loss_avoided": round(avoided)}
