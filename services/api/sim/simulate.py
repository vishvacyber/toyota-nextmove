"""24-month portfolio simulation: baseline vs NXT (GET /kpis), fairness report and offer A/B simulation.

Engine math only (rule 1). Each customer's next-best action and retention odds come from B4's NBA scoring over the
engine's options; the simulation adds expected values over the horizon, so the same assumptions always give the same
numbers. Coefficients live in config `[simulation]`. Fairness groups use region and credit tier only (rule 4).
"""

import math
import re
from dataclasses import dataclass
from functools import cache

from agents import recommend
from app.models import (
    Assumptions,
    FairnessReport,
    Group,
    KpiMetrics,
    KpiSnapshot,
    MaturityPipeline,
    Offer,
    OfferSimulation,
    Series,
    Situation,
    Status7,
    Variant,
)
from engine import finance, nba, scenarios
from engine.scenarios import AS_OF, CFG, TODAY
from sim.generator import customers_by_id

SIM, NBA = CFG["simulation"], CFG["nba"]


@dataclass(frozen=True)
class Row:
    id: str
    region: str
    tier: str
    situation: Situation
    option: str
    odds: float           # NBA retention odds if the customer acts on the recommended option
    margin: float         # NBA margin on the recommended option's payments (next contract value)
    payment: float
    payoff: float
    apr: float
    remaining: int
    horizon: int          # months of the recommended option's payments
    stressed: bool
    roll: float           # baseline 24-month chance of serious delinquency
    cure: float           # NBA cure lift of the recommended option
    event: int | None     # month of the stay-or-leave decision, None if none within the horizon
    days_to_maturity: int
    lease: bool
    facts: dict           # what offer rules can test: engine facts + situation, model, powertrain


def _event(c, situation: Situation) -> int | None:
    months = math.ceil((c.contract.maturity_date - TODAY).days / 30.44)
    if months <= SIM["months"]:
        return max(months, 1)
    return SIM["event_month"].get(situation.value)


@cache   # deterministic: fixed engine date, seeded customers
def rows() -> tuple[Row, ...]:
    out = []
    for c in customers_by_id().values():
        rec = recommend.pick(c.situation, recommend.scenario_set(c))
        s, k, stressed = nba.score(c, rec), c.contract, scenarios.payment_stress(c)
        out.append(Row(
            id=c.id, region=c.region.value, tier=c.credit_tier.value, situation=c.situation, option=rec.option.value,
            odds=s["retention_odds"], margin=s["margin"], payment=k.monthly_payment, payoff=k.payoff_amount, apr=k.apr,
            remaining=scenarios.remaining_months(c), horizon=rec.horizon_months or scenarios.remaining_months(c),
            stressed=stressed,
            roll=SIM["stress_roll_rate"] if stressed else c.risk_score * SIM["roll_rate_per_risk"],
            cure=NBA["cure_lift"].get(rec.option.value, 0.0), event=_event(c, c.situation),
            days_to_maturity=(k.maturity_date - TODAY).days, lease=k.type.value == "lease",
            facts={**scenarios.facts(c), "situation": c.situation.value, "model": c.vehicle.model.value,
                   "powertrain": c.vehicle.powertrain.value}))
    return tuple(out)


def defaults() -> Assumptions:
    return Assumptions(adoption_rate=SIM["adoption_rate"], outreach_lead_days=SIM["outreach_lead_days"],
                       hardship_uptake=SIM["hardship_uptake"])


def reach(lead_days: int) -> float:
    return 1 - math.exp(-lead_days / SIM["reach_tau_days"])


def _metrics(rs: tuple[Row, ...], a: Assumptions | None) -> tuple[KpiMetrics, list[float]]:
    """a=None is the baseline (no NXT). Returns the metrics and the 24-month retention series."""
    n, months = len(rs), SIM["months"]
    act = a.adoption_rate * reach(a.outreach_lead_days) if a else 0.0
    uptake = a.hardship_uptake if a else 0.0
    lost_by_month = [0.0] * (months + 1)
    revenue = loyalty = losses = calls = touches = delinquent = 0.0
    for r in rs:
        b = SIM["baseline_retention"].get(r.situation.value, SIM["baseline_retention"]["none"])
        stay = b + act * max(r.odds - b, 0.0)   # a do_nothing recommendation gives no lift
        roll = r.roll * (1 - uptake * r.cure) if r.stressed else r.roll
        delinquent += roll
        losses += roll * r.payoff * NBA["loss_given_default"]
        calls += SIM["calls_per_customer"]
        if r.stressed:
            calls += SIM["calls_per_stressed"] * (1 - uptake * SIM["hardship_call_deflection"])
            touches += 1 if a else 0
        if r.event is None:
            revenue += NBA["margin_rate"] * r.payment * min(r.remaining, months)
            continue
        lost_by_month[r.event] += 1 - stay
        revenue += NBA["margin_rate"] * r.payment * min(r.event, r.remaining)
        loyalty += stay * r.margin
        calls += SIM["calls_per_decision"] * (1 - act * SIM["self_service_deflection"])
        touches += reach(a.outreach_lead_days) if a else 0
    series, lost = [], 0.0
    for m in range(1, months + 1):
        lost += lost_by_month[m]
        series.append(round(1 - lost / n, 4))
    revenue += loyalty - losses
    cost = calls * SIM["cost_per_call"] + touches * SIM["cost_per_outreach"]
    return KpiMetrics(retention_rate=series[-1], calls_per_100_customers=round(calls / n * 100, 1),
                      delinquency_rate=round(delinquent / n, 4), revenue=round(revenue), cost_to_serve=round(cost),
                      avg_ltv=round((revenue - cost) / n), loyalty_revenue=round(loyalty)), series


def kpis(a: Assumptions | None = None) -> KpiSnapshot:
    a, rs = a or defaults(), rows()
    base, base_series = _base()
    nm, nm_series = _metrics(rs, a)
    leases = [r.days_to_maturity for r in rs if r.lease and r.days_to_maturity >= 0]
    return KpiSnapshot(
        as_of=AS_OF, customers_simulated=len(rs), months=SIM["months"], assumptions=a, baseline=base, nextmove=nm,
        series=[Series(month=m, baseline_retention=b, nextmove_retention=x)
                for m, (b, x) in enumerate(zip(base_series, nm_series, strict=True), start=1)],
        maturity_pipeline=MaturityPipeline(**{f"d{d}": sum(x <= d for x in leases) for d in (90, 60, 30)}))


@cache
def _base() -> tuple[KpiMetrics, list[float]]:
    return _metrics(rows(), None)


# Offer rules: clauses joined by AND, each a situation name ("lease_end") or `field op value`
# ("days_to_maturity <= 90", "powertrain = gas"). Fields are engine facts only: no region, credit tier or
# protected attribute, so an offer can't be aimed at a group (rule 4).
RULE_FIELDS = ("contract_type", "days_to_maturity", "days_past_due", "remaining_months", "payoff", "equity",
               "rate_drop", "extended_term", "payment_stress", "situation", "model", "powertrain")
RULE_OPS = {"<=": "lte", ">=": "gte", "!=": "ne", "<": "lt", ">": "gt", "=": "eq", "==": "eq"}
CLAUSE = re.compile(r"(\w+)\s*(<=|>=|!=|==|<|>|=)\s*(.+)")


@cache
def parse_rule(rule: str) -> tuple[tuple[str, str, object], ...]:
    """[(field, op, value)] for a readable rule; ValueError with a readable reason if it can't be read."""
    clauses = []
    for part in filter(None, (p.strip() for p in re.split(r"\s+AND\s+", rule.strip(), flags=re.IGNORECASE))):
        if re.search(r"\bOR\b", part, re.IGNORECASE):
            raise ValueError("Offer rules support AND only")
        if part in Situation.__members__:
            clauses.append(("situation", "eq", part))
            continue
        m = CLAUSE.fullmatch(part)
        if not m:
            raise ValueError(f"Can't read rule clause '{part}' (use field op value, e.g. days_to_maturity <= 90)")
        field, op, raw = m.group(1), RULE_OPS[m.group(2)], m.group(3).strip().strip("'\"")
        if field not in RULE_FIELDS:
            raise ValueError(f"Unknown rule field '{field}'. Use one of: {', '.join(RULE_FIELDS)}")
        value: object = {"true": True, "false": False}.get(raw.lower(), raw)
        if isinstance(value, str):
            try:
                value = float(value.replace(",", "").lstrip("$"))
            except ValueError:
                pass
        if isinstance(value, str) and op not in ("eq", "ne"):
            raise ValueError(f"'{part}' compares text; use = or !=")
        clauses.append((field, op, value))
    return tuple(clauses)


def _targets(o: Offer, r: Row) -> bool:
    return r.situation != Situation.none and o.target_situation in (None, r.situation) and \
        all(scenarios.OPS[op](r.facts[field], value) for field, op, value in parse_rule(o.rule))


def fairness(offers: list[Offer]) -> FairnessReport:
    rs, threshold = rows(), SIM["fairness_threshold"]
    active = [o for o in offers if o.status == Status7.active]

    def rates(group: list[Row]) -> tuple[float, float]:
        return (sum(r.option != "do_nothing" for r in group) / len(group),
                sum(any(_targets(o, r) for o in active) for r in group) / len(group))

    groups = []
    for dim, key in (("region", "region"), ("credit_tier", "tier")):
        overall = rates(list(rs))
        for value in sorted({getattr(r, key) for r in rs}):
            g = [r for r in rs if getattr(r, key) == value]
            rec, off = rates(g)
            groups.append(Group(dimension=dim, group=value, customers=len(g), recommendation_rate=round(rec, 3),
                                offer_rate=round(off, 3),
                                flagged=abs(rec - overall[0]) > threshold or abs(off - overall[1]) > threshold))
    return FairnessReport(as_of=AS_OF, threshold=threshold, groups=groups)


def incentive_value(o: Offer, r: Row) -> float:
    """$ cost of the incentive for one customer. A rate reduction is the engine's payment difference on the payoff,
    financed over the recommended option's horizon (e.g. a 60-month buyout loan at lease end)."""
    if o.incentive.type.value != "rate_reduction":
        return o.incentive.value
    n = max(r.horizon, 1)
    lower = finance.monthly_payment(r.payoff, max(r.apr - o.incentive.value, 0), n)
    return (finance.monthly_payment(r.payoff, r.apr, n) - lower) * n


def simulate_offer(offer: Offer, variants: list[Offer]) -> OfferSimulation:
    targeted = [r for r in rows() if _targets(offer, r)]
    w = SIM["offers"]["w_incentive_per_1k"]
    out = []
    for v in [offer, *variants]:
        accept = lift = profit = 0.0
        for r in targeted:
            cost = incentive_value(v, r)
            p = 1 / (1 + math.exp(-(math.log(r.odds / (1 - r.odds)) + w * cost / 1000)))
            accept, lift, profit = accept + p, lift + p - r.odds, profit + p * (r.margin - cost)
        k = len(targeted) or 1
        out.append(Variant(name=v.name, acceptance_rate=round(accept / k, 3), expected_profit=round(profit),
                           retention_lift=round(lift / k, 3)))
    return OfferSimulation(offer_id=offer.id, customers_targeted=len(targeted), variants=out)
