"""Timing optimizer: the customer's net position if they act now vs in each of the next months. Engine numbers only.

net_position(m) = equity(m) − fees added by waiting − payments made by then (loans only).
For a loan the principal part of those payments comes back as equity, so waiting costs depreciation + interest.
Lease payments before maturity are shared by every option and left out (as in scenarios); past maturity the extra
miles go over the allowance. A past-due account adds another late fee every month it stays unresolved.
"""

from app.models import Customer, Month, Overrides, TimingPlan
from engine import finance, scenarios
from engine.scenarios import AS_OF, TODAY, usd


def _row(c: Customer, m: int) -> dict:
    with scenarios.ahead(m):
        a = scenarios.advance(c, m)
        value = scenarios.market_value(a.vehicle)
        equity = scenarios.equity(a)
    k, ka = c.contract, a.contract
    fees = scenarios.late_fee(c) * (1 + m)
    if k.type == "lease":
        over = lambda x: finance.mileage_overage(scenarios.projected_miles(x, Overrides()), k.annual_mile_allowance or 0,
                                                 k.term_months, k.excess_mile_fee or 0)[1]
        fees += over(a) - over(c)
        paid = 0.0
    else:
        paid = k.monthly_payment * (ka.payments_made - k.payments_made)
    return {"value": value, "equity": equity, "fees": fees, "paid": paid,
            "principal": k.payoff_amount - ka.payoff_amount if k.type == "loan" else 0.0}


def timing(c: Customer, months: int = 6) -> TimingPlan:
    raw = [_row(c, m) for m in range(months + 1)]
    rows = [Month(month_offset=m, date=finance.add_months(TODAY, m), equity=round(r["equity"], 2),
                  payment=c.contract.monthly_payment, fees=round(r["fees"], 2),
                  net_position=round(r["equity"] - r["fees"] - r["paid"], 2)) for m, r in enumerate(raw)]
    best = max(rows, key=lambda r: r.net_position)   # earliest month wins a tie
    w = min(3, months)
    delta = round(rows[0].net_position - rows[w].net_position, 2)
    parts = {"value loss": raw[0]["value"] - raw[w]["value"], "interest": raw[w]["paid"] - raw[w]["principal"],
             "added fees": raw[w]["fees"] - raw[0]["fees"]}
    because = ", ".join(f"{usd(v)} {k}" for k, v in parts.items() if round(v) > 0)
    if delta > 0:
        summary = f"Acting now is worth about {usd(delta)} more than waiting {w} months" + (f" ({because})." if because else ".")
    else:
        summary = f"Waiting {w} months doesn't cost you anything right now."
    if best.month_offset:
        summary += f" Your best month is {best.date:%B %Y}."
    return TimingPlan(customer_id=c.id, months=rows, best_month_offset=best.month_offset, act_now_vs_wait_3=delta,
                      summary=summary, as_of=AS_OF)

