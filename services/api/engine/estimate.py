"""Walk-in estimate (kiosk, no account): price each car, its loan and lease, and an optional trade-in.

Same engine as the customer scenarios: finance.py for the math, the cached SerpApi MSRP and comps for the prices.
"""

from datetime import UTC, datetime

from app.models import Estimate, EstimateRequest, EstimateVehicle, TradeInValue, Vehicle
from engine import finance
from engine.scenarios import CFG, TODAY, comp_value, market_source, market_value, new_price, true_cost, usd
from serpapi import client, queries


def warm_comps(model: str, year: int) -> None:
    """Walk-ins bring any model-year, not just the personas' cached ones: on a miss, one live SerpApi search (then
    cached in Supabase; the client's per-process budget caps spend). Offline or over budget: the depreciation table."""
    if comp_value(model, year) is not None:
        return
    try:
        client.search(*queries.comps(model, year, new=year > TODAY.year))
    except client.CacheMiss:
        return
    comp_value.cache_clear()
    client._db_engine_rows.cache_clear()


def trade_in(req: EstimateRequest) -> TradeInValue | None:
    t = req.trade_in
    if not t:
        return None
    warm_comps(t.model.value, t.year)
    v = Vehicle(vin="WALKIN", model=t.model, year=t.year, trim="", powertrain="gas", color="", odometer_miles=t.odometer_miles)
    value = market_value(v)
    source, as_of = market_source(v)
    return TradeInValue(estimated_value=value, payoff=t.payoff, equity=round(value - t.payoff, 2), source=source, as_of=as_of)


def priced(model: str, req: EstimateRequest, equity: float) -> EstimateVehicle:
    e, cat, fee = CFG["estimate"], CFG["catalog"][model], CFG["fees"]["dealer_doc"]
    apr = CFG["rates"]["new_vehicle"][(req.credit_tier.value if req.credit_tier else e["credit_tier"])]
    msrp, source = new_price(model)
    n, down, lease_n = req.term_months, req.down_payment, e["lease_term_months"]
    # Positive equity lowers what's financed; negative equity (owe more than it's worth) is rolled in.
    cap = max(msrp + fee - equity - down, 0)
    loan = finance.monthly_payment(cap, apr, n)
    residual = round(msrp * e["lease_residual"], 2)
    lease = finance.lease_payment(max(cap, residual), residual, apr, lease_n)
    tc = true_cost(model, cat["powertrain"], cat["mpg"], loan, req.annual_miles)
    h = e["horizon_months"]
    five = down + loan * min(n, h) + (tc.fuel + tc.maintenance + tc.insurance) * h
    vehicle = Vehicle(vin=f"SYNNEW{model.upper()}"[:17], model=model, year=TODAY.year + 1, trim=cat["trim"],
                      powertrain=cat["powertrain"], color="Supersonic Red", odometer_miles=12, mpg=cat["mpg"])
    return EstimateVehicle(vehicle=vehicle, msrp=msrp, msrp_source=source, apr=apr, loan_payment=round(loan, 2),
                           lease_payment=round(lease, 2), lease_term_months=lease_n, residual=residual, true_cost=tc,
                           five_year_cost=round(five, 2))


def estimate(req: EstimateRequest) -> Estimate:
    t = trade_in(req)
    equity = t.equity if t else 0
    e = CFG["estimate"]
    d = CFG["driving"]
    notes = [(f"{usd(req.down_payment)} down, loan over {req.term_months} months; lease {e['lease_term_months']} months "
             f"with {e['lease_residual']:.0%} of MSRP as residual"),
             f"{usd(CFG['fees']['dealer_doc'])} dealer fees included",
             f"{req.annual_miles:,} miles/year, gas at ${d['gas_price']:.2f}/gal, electricity at ${d['electricity_price']:.2f}/kWh",
             "Estimate only: excludes sales tax, registration and credit approval"]
    if t:
        notes.insert(0, f"Trade-in {usd(t.estimated_value)} − {usd(t.payoff)} owed = {usd(t.equity)} equity "
                        f"({t.source}, as of {t.as_of})")
    vehicles = [priced(m.value, req, equity) for m in req.models]
    for v in vehicles:
        # A lease can't use more than the car's depreciation; say where the rest goes instead of hiding it.
        extra = v.residual - (v.msrp + CFG["fees"]["dealer_doc"] - equity - req.down_payment)
        if extra > 0:
            notes.append(f"Lease on the {v.vehicle.model}: your down payment and equity cover all of its depreciation, so "
                         f"the lease is only the rent charge and {usd(extra)} would come back to you")
    return Estimate(vehicles=vehicles, trade_in=t, assumptions=notes, generated_at=datetime.now(UTC))
