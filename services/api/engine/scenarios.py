"""Scenario builders: turn a customer + overrides into contract-shaped Scenario objects.

Every number comes from engine.finance and config.toml. Eligibility comes from eligibility.toml.
"""

import operator
import tomllib
from datetime import datetime
from pathlib import Path

from app.models import (
    Customer,
    OptionType,
    Overrides,
    Scenario,
    ScenarioRequest,
    ScenarioSet,
    Situation,
    Status2,
    TrueCost,
    Vehicle,
)
from engine import finance

HERE = Path(__file__).parent
CFG = tomllib.loads((HERE / "config.toml").read_text())
RULES = tomllib.loads((HERE / "eligibility.toml").read_text())
AS_OF = datetime.fromisoformat(CFG["as_of"])
TODAY = AS_OF.date()
OPS = {"eq": operator.eq, "ne": operator.ne, "lt": operator.lt, "lte": operator.le, "gt": operator.gt, "gte": operator.ge}


def usd(x: float) -> str:
    return f"-${-x:,.0f}" if x < 0 else f"${x:,.0f}"


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


# ---------- facts about a customer ----------

def market_value(v: Vehicle) -> float:
    m = CFG["market"]
    return round(finance.market_value(m["msrp"][v.model], TODAY.year - v.year, v.odometer_miles, m["retention"],
                                      m["expected_miles_per_year"], m["per_mile_adjust"]))


def market_note(v: Vehicle) -> str:
    return f"Market value {usd(market_value(v))} for a {v.year} {v.model} at {v.odometer_miles:,} mi " \
           f"({CFG['market']['source']}, as of {TODAY.isoformat()})"


def remaining_months(c: Customer) -> int:
    return max(c.contract.term_months - c.contract.payments_made, 0)


def equity(c: Customer) -> float:
    """Market value minus what's owed: the residual at lease end, or the loan payoff."""
    k = c.contract
    owed = k.residual_value if k.type == "lease" and k.residual_value is not None else k.payoff_amount
    return market_value(c.vehicle) - owed


def annual_miles(c: Customer, o: Overrides) -> int:
    k = c.contract
    if o.annual_miles:
        return o.annual_miles
    if k.projected_miles_at_maturity and k.term_months:
        return round(k.projected_miles_at_maturity / k.term_months * 12)
    return CFG["market"]["expected_miles_per_year"]


def projected_miles(c: Customer, o: Overrides) -> int:
    k = c.contract
    if not o.annual_miles and k.projected_miles_at_maturity:
        return k.projected_miles_at_maturity
    return round(c.vehicle.odometer_miles + annual_miles(c, o) * remaining_months(c) / 12)


def payment_stress(c: Customer) -> bool:
    return c.contract.days_past_due > 0 or c.contract.status in (Status2.late, Status2.missed)


def facts(c: Customer) -> dict:
    k = c.contract
    return {
        "contract_type": k.type.value,
        "days_to_maturity": (k.maturity_date - TODAY).days,
        "days_past_due": k.days_past_due,
        "remaining_months": remaining_months(c),
        "payoff": k.payoff_amount,
        "equity": equity(c),
        "rate_drop": round(k.apr - CFG["rates"]["refinance"][c.credit_tier], 2),
        "extended_term": k.term_months + CFG["terms"]["loan_extension_months"],
        "payment_stress": payment_stress(c),
    }


def ineligible_reason(option: OptionType, f: dict) -> str | None:
    """First failing rule's reason, or None when every rule passes."""
    if option not in BUILDERS:
        return "This option isn't modeled yet."
    for rule in RULES.get(option.value, []):
        if rule.get("only_for", f["contract_type"]) != f["contract_type"]:
            continue
        if not OPS[rule["op"]](f[rule["field"]], rule["value"]):
            return rule["reason"]
    return None


def detect_situation(c: Customer) -> Situation:
    """Highest-priority SPEC §3 trigger for this customer."""
    f, k = facts(c), c.contract
    lease = f["contract_type"] == "lease"
    if f["payment_stress"]:
        return Situation.payment_stress
    if lease and f["days_to_maturity"] <= 90:
        return Situation.lease_end
    if lease and finance.mileage_overage(projected_miles(c, Overrides()), k.annual_mile_allowance or 0,
                                         k.term_months, 1)[0] > 0:
        return Situation.mileage_overage
    if not lease and f["rate_drop"] >= 1.0 and f["remaining_months"] >= 12:
        return Situation.rate_drop
    if not lease and f["equity"] >= 5000:
        return Situation.positive_equity
    if not lease and f["remaining_months"] <= 6:
        return Situation.early_payoff
    if c.vehicle.powertrain == "gas" and annual_miles(c, Overrides()) >= 15000:
        return Situation.ev_switch
    if c.life_events:
        return Situation.life_event
    return Situation.none


# ---------- helpers ----------

def true_cost(model: str, powertrain: str, mpg: float | None, payment: float, miles: int) -> TrueCost:
    d = CFG["driving"]
    mpg = mpg or CFG["catalog"][model]["mpg"]
    fuel, co2 = finance.fuel(miles, mpg, powertrain == "ev", d["gas_price"], d["electricity_price"],
                             d["kwh_per_gallon_equivalent"], d["co2_kg_per_gallon"], d["co2_kg_per_kwh"])
    maint, ins = d["maintenance"][powertrain], d["insurance"][model]
    return TrueCost(payment=round(payment, 2), fuel=round(fuel, 2), maintenance=maint, insurance=ins,
                    total_monthly=round(payment + fuel + maint + ins, 2), co2_kg_per_year=round(co2))


def current_true_cost(c: Customer, o: Overrides, payment: float) -> TrueCost:
    v = c.vehicle
    return true_cost(v.model, v.powertrain, v.mpg, payment, annual_miles(c, o))


def driving_note(c: Customer, o: Overrides, mpg: float, powertrain: str) -> str:
    d = CFG["driving"]
    energy = f"electricity at ${d['electricity_price']:.2f}/kWh" if powertrain == "ev" else f"gas at ${d['gas_price']:.2f}/gal"
    return f"{annual_miles(c, o):,} miles/year, {mpg:g} {'MPGe' if powertrain == 'ev' else 'MPG'}, {energy}"


def scenario(option: OptionType, label: str, monthly: float, total: float, equity_: float, fees: float,
             assumptions: list[str], horizon: int | None = None, **extra) -> Scenario:
    return Scenario(option=option, label=label, eligible=True, monthly_payment=round(monthly, 2),
                    total_cost=round(total, 2), horizon_months=horizon, equity=round(equity_, 2), fees=round(fees, 2),
                    assumptions=assumptions, **extra)


def late_fee(c: Customer) -> float:
    return CFG["fees"]["late"] if c.contract.days_past_due > CFG["fees"]["late_after_days"] else 0


def return_fees(c: Customer, o: Overrides) -> tuple[float, list[str]]:
    k, f = c.contract, CFG["fees"]
    over, charge = finance.mileage_overage(projected_miles(c, o), k.annual_mile_allowance or 0, k.term_months,
                                           k.excess_mile_fee or 0)
    notes = [f"{over:,} miles over allowance × ${k.excess_mile_fee or 0:.2f} = {usd(charge)}"] if over else []
    notes += [f"{usd(f['disposition'])} disposition fee", f"~{usd(f['wear_estimate'])} estimated wear (until photo pre-inspection)"]
    return charge + f["disposition"] + f["wear_estimate"], notes


# ---------- option builders ----------

def build_return(c: Customer, o: Overrides) -> Scenario:
    fees, notes = return_fees(c, o)
    e = equity(c)
    if e > 0:
        notes.append(f"You leave {usd(e)} of equity with the vehicle")
    return scenario(OptionType.return_, "Return it", 0, fees, 0, fees, notes + [market_note(c.vehicle)])


def build_keep(c: Customer, o: Overrides, option: OptionType = OptionType.keep) -> Scenario:
    k, n = c.contract, remaining_months(c)
    notes = [f"{n} payments of {usd(k.monthly_payment)} left at {k.apr:g}% APR", market_note(c.vehicle),
             driving_note(c, o, c.vehicle.mpg or CFG["catalog"][c.vehicle.model]["mpg"], c.vehicle.powertrain)]
    if k.days_past_due:
        notes += [f"{k.days_past_due} days past due: {usd(k.monthly_payment)} owed now",
                  "Payments 30+ days past due can be reported to credit bureaus"]
    label = f"Keep your {c.vehicle.model}" if option == OptionType.keep else "Do nothing"
    return scenario(option, label, k.monthly_payment, k.monthly_payment * n, equity(c), 0, notes, n,
                    true_cost=current_true_cost(c, o, k.monthly_payment))


def build_do_nothing(c: Customer, o: Overrides) -> Scenario:
    if c.contract.type == "lease":
        s = build_return(c, o)
        return s.model_copy(update={"option": OptionType.do_nothing, "label": "Do nothing (return at lease end)"})
    return build_keep(c, o, OptionType.do_nothing)


def build_buyout(c: Customer, o: Overrides) -> Scenario:
    k, f = c.contract, CFG["fees"]
    residual = k.residual_value or 0
    price, down = residual + f["purchase_option"], o.down_payment or 0
    n, apr = o.term_months or CFG["terms"]["buyout_months"], o.apr if o.apr is not None else CFG["rates"]["buyout"][c.credit_tier]
    pmt = finance.monthly_payment(price - down, apr, n)
    avoided, _ = return_fees(c, o)
    notes = [f"Buyout price = residual {usd(residual)} + {usd(f['purchase_option'])} purchase-option fee",
             f"{usd(down)} down, financed {n} months at {apr:g}% APR", market_note(c.vehicle),
             f"Avoids about {usd(avoided)} in return charges", "Excludes sales tax and registration"]
    return scenario(OptionType.buyout, f"Buy your {c.vehicle.model}", pmt, pmt * n + down, equity(c),
                    f["purchase_option"], notes, n, true_cost=current_true_cost(c, o, pmt))


def build_refinance(c: Customer, o: Overrides) -> Scenario:
    k = c.contract
    n, apr = o.term_months or remaining_months(c), o.apr if o.apr is not None else CFG["rates"]["refinance"][c.credit_tier]
    pmt = finance.monthly_payment(k.payoff_amount, apr, n)
    fee = CFG["fees"]["refinance"]
    notes = [f"{apr:g}% APR vs your current {k.apr:g}%", f"Payoff {usd(k.payoff_amount)} over {n} months",
             f"{usd(k.monthly_payment - pmt)} less per month"]
    return scenario(OptionType.refinance, "Refinance with TFS", pmt, pmt * n + fee, equity(c), fee, notes, n,
                    true_cost=current_true_cost(c, o, pmt))


def build_trade_in(c: Customer, o: Overrides) -> Scenario:
    e, k = equity(c), c.contract
    owed = "residual" if k.type == "lease" else "payoff"
    owed_amt = k.residual_value if k.type == "lease" else k.payoff_amount
    notes = [f"Market value {usd(market_value(c.vehicle))} − {owed} {usd(owed_amt or 0)} = {usd(e)} equity", market_note(c.vehicle)]
    return scenario(OptionType.trade_in, "Trade in", 0, max(-e, 0), e, 0, notes)


def build_extend(c: Customer, o: Overrides) -> Scenario:
    k, t, fee = c.contract, CFG["terms"], CFG["fees"]["extension"]
    if k.type == "lease":
        m = t["lease_extension_months"]
        extra_miles = max(annual_miles(c, o) - (k.annual_mile_allowance or 0), 0) * m / 12
        extra = extra_miles * (k.excess_mile_fee or 0)
        notes = [f"Same {usd(k.monthly_payment)} payment for {m} more months",
                 f"About {extra_miles:,.0f} more miles over allowance (+{usd(extra)} at return)"]
        return scenario(OptionType.extend, f"Extend {m} months", k.monthly_payment, k.monthly_payment * m + fee + extra,
                        equity(c), fee + extra, notes, m)
    m, rem = t["loan_extension_months"], remaining_months(c)
    n = rem + m
    pmt = finance.monthly_payment(k.payoff_amount, k.apr, n)
    extra_interest = pmt * n - finance.monthly_payment(k.payoff_amount, k.apr, rem) * rem
    notes = [f"Payoff {usd(k.payoff_amount)} re-spread over {n} months at {k.apr:g}% APR",
             f"About {usd(extra_interest)} more interest overall"]
    return scenario(OptionType.extend, f"Extend {m} months", pmt, pmt * n + fee, equity(c), fee, notes, n,
                    true_cost=current_true_cost(c, o, pmt))


def build_upgrade(c: Customer, o: Overrides) -> Scenario:
    target = (o.target_model.value if o.target_model else None) or CFG["upgrade_default"][c.vehicle.model]
    cat, fee = CFG["catalog"][target], CFG["fees"]["dealer_doc"]
    e, down = equity(c), o.down_payment or 0
    n, apr = o.term_months or CFG["terms"]["upgrade_months"], o.apr if o.apr is not None else CFG["rates"]["new_vehicle"][c.credit_tier]
    financed = max(cat["price"] + fee - e - down, 0)
    pmt = finance.monthly_payment(financed, apr, n)
    vehicle = Vehicle(vin=f"SYNNEW{target.upper()}{cat['powertrain'].upper()}"[:17], model=target, year=TODAY.year + 1,
                      trim=cat["trim"], powertrain=cat["powertrain"], color="Supersonic Red", odometer_miles=12, mpg=cat["mpg"])
    notes = [f"{usd(e)} equity applied to a {usd(cat['price'])} {target} {cat['trim']}",
             f"{usd(fee)} dealer fees, {usd(down)} down, {n} months at {apr:g}% APR",
             driving_note(c, o, cat["mpg"], cat["powertrain"]), market_note(c.vehicle), "Excludes sales tax and registration"]
    return scenario(OptionType.upgrade, f"Upgrade to {target} {cat['trim']}", pmt, pmt * n + down, e, fee, notes, n,
                    target_vehicle=vehicle, true_cost=true_cost(target, cat["powertrain"], cat["mpg"], pmt, annual_miles(c, o)))


def build_due_date_change(c: Customer, o: Overrides) -> Scenario:
    k, n = c.contract, remaining_months(c)
    new_day = finance.aligned_due_day(c.next_payday, c.pay_frequency) if c.next_payday else k.due_day
    fee = CFG["fees"]["due_date_change"]
    notes = [(f"Moves your due date from the {ordinal(k.due_day)} to the {ordinal(new_day)}, "
             f"right after your {c.pay_frequency.value} payday"), f"{usd(fee)} fee; one-time change"]
    return scenario(OptionType.due_date_change, f"Move due date to the {ordinal(new_day)}", k.monthly_payment,
                    k.monthly_payment * n + fee, equity(c), fee, notes, n)


def build_deferral(c: Customer, o: Overrides) -> Scenario:
    k, n = c.contract, remaining_months(c)
    extra = finance.deferral_interest(k.monthly_payment, k.apr, n)
    notes = [f"Moves one {usd(k.monthly_payment)} payment to the end of your loan", f"About {usd(extra)} extra interest",
             "Needs approval from a TFS specialist"]
    return scenario(OptionType.deferral, "Defer one payment", k.monthly_payment, k.monthly_payment * n + extra,
                    equity(c), 0, notes, n)


BUILDERS = {
    OptionType.do_nothing: build_do_nothing, OptionType.keep: build_keep, OptionType.buyout: build_buyout,
    OptionType.return_: build_return, OptionType.refinance: build_refinance, OptionType.trade_in: build_trade_in,
    OptionType.extend: build_extend, OptionType.upgrade: build_upgrade,
    OptionType.due_date_change: build_due_date_change, OptionType.deferral: build_deferral,
}


def run(req: ScenarioRequest, c: Customer) -> ScenarioSet:
    """All eligible options (do_nothing first), or exactly the requested ones with ineligible ones explained."""
    o, f, fee = req.overrides or Overrides(), facts(c), late_fee(c)
    out = []
    # keep only applies to loans, where it equals the do_nothing baseline; list it only when asked for.
    for option in req.options or [x for x in BUILDERS if x != OptionType.keep]:
        reason = ineligible_reason(option, f)
        if reason is None:
            s = BUILDERS[option](c, o)
            if fee:   # already owed, so every option carries it
                s = s.model_copy(update={"fees": s.fees + fee, "total_cost": s.total_cost + fee,
                                         "assumptions": [*s.assumptions, f"Includes the {usd(fee)} late fee already owed"]})
            out.append(s)
        elif req.options:
            out.append(Scenario(option=option, label=option.value.replace("_", " ").capitalize(), eligible=False,
                                ineligible_reason=reason, monthly_payment=0, total_cost=0, equity=0, fees=0, assumptions=[]))
    return ScenarioSet(customer_id=c.id, scenarios=out, as_of=AS_OF, assumptions=[
        market_note(c.vehicle), "Synthetic data. Estimates only, not a credit decision.",
        "Lease options are valued at lease end and exclude the remaining lease payments, which every option shares."
        if c.contract.type == "lease" else "Totals are out-of-pocket over each option's horizon.",
    ])
