"""GET /customers/{id}/recommendation. The engine's scenarios decide; the option is picked by fixed rules, never by
the LLM. `why` is a cached, Guardian-checked Advisor explanation (personas) or a template over engine numbers, so the
page never waits on a model call."""

from agents import fallback, guardian
from app.models import (
    AutonomyLevel,
    Customer,
    NextAction,
    OptionType,
    Recommendation,
    Review,
    Scenario,
    ScenarioRequest,
    ScenarioSet,
    Situation,
    Status3,
    Type1,
    WhyNotItem,
)
from engine import scenarios
from engine.scenarios import AS_OF, usd

O = OptionType
REVIEWS: dict[str, Review] = {}   # customer_id → latest employee review (NextMove Review), in memory
PREFER = {   # first eligible option wins
    Situation.lease_end: [O.buyout, O.return_], Situation.mileage_overage: [O.buyout, O.return_],
    Situation.positive_equity: [O.upgrade, O.trade_in, O.refinance], Situation.ev_switch: [O.upgrade],
    Situation.rate_drop: [O.refinance], Situation.payment_stress: [O.due_date_change, O.extend],
}
ACTIONS = {
    O.buyout: (Type1.start_self_service, "Start buyout"), O.return_: (Type1.start_inspection, "Start photo pre-inspection"),
    O.upgrade: (Type1.send_deal_packet, "Send deal packet to dealer"), O.trade_in: (Type1.send_deal_packet, "Send deal packet to dealer"),
    O.refinance: (Type1.start_self_service, "Start refinance"), O.due_date_change: (Type1.request_callback, "Request a callback"),
    O.extend: (Type1.request_callback, "Request a callback"),
}


def scenario_set(c: Customer) -> ScenarioSet:
    return scenarios.run(ScenarioRequest(customer_id=c.id), c)


def pick(situation: Situation, ss: ScenarioSet) -> Scenario:
    by = {s.option: s for s in ss.scenarios if s.eligible}
    for option in PREFER.get(situation, []):
        s = by.get(option)
        if s and not (option == O.buyout and s.equity <= 0):   # buying a car worth less than its buyout price isn't a win
            return s
    return by[O.do_nothing]


def headline(c: Customer, s: Scenario) -> str:
    return {O.buyout: f"Buying your {c.vehicle.model} beats returning it", O.return_: f"Returning your {c.vehicle.model} is your best move",
            O.upgrade: f"{s.label} and put your equity to work", O.trade_in: "Trading in puts your equity to work",
            O.refinance: "Refinancing with TFS lowers your payment", O.due_date_change: "Move your due date to match your payday",
            O.extend: "A longer term lowers your payment"}.get(s.option, "You're on track, no change needed")


def template_why(s: Scenario, baseline: Scenario | None) -> str:
    if s.option == O.do_nothing:
        return "Your contract is in good shape today. We'll let you know if a better option comes up."
    parts = [f"{s.label}: {usd(s.monthly_payment)} a month" if s.monthly_payment else s.label]
    if s.equity:
        parts.append(f"keeps {usd(s.equity)} of equity")
    if baseline and baseline.fees > s.fees:
        parts.append(f"and costs {usd(s.fees)} in fees instead of {usd(baseline.fees)}")
    return ", ".join(parts) + "."


def why_not(s: Scenario) -> str:
    if s.option == O.deferral:
        return "A deferral needs a TFS specialist to approve. We can ask one to call you."
    return f"{usd(s.total_cost)} out of pocket, {usd(s.fees)} in fees."


def recommendation(c: Customer) -> Recommendation:
    ss, situation = scenario_set(c), c.situation
    rec = pick(situation, ss)
    baseline = next((s for s in ss.scenarios if s.option == O.do_nothing), None)
    alts = [s for s in ss.scenarios if s.option not in (rec.option, O.do_nothing)]
    cached = fallback.why(c.id)
    why, outputs, trace_id = (cached["why"], cached["tool_outputs"], cached["trace_id"]) if cached \
        else (template_why(rec, baseline), [], None)
    outputs = [*outputs, ("run_scenario", ss.model_dump(mode="json"))]
    verdict, _ = guardian.check("\n".join([why, *ss.assumptions]), outputs)
    if cached and verdict.verdict.value != "pass":   # cached text drifted from today's engine numbers: use the template
        why, trace_id = template_why(rec, baseline), None
        verdict, _ = guardian.check("\n".join([why, *ss.assumptions]), outputs)
    type_, label = ACTIONS.get(rec.option, (Type1.book_appointment, "Book a check-in"))
    return Recommendation(
        customer_id=c.id, situation=situation, headline=headline(c, rec), recommended=rec, alternatives=alts,
        baseline=baseline, why=why, why_not=[WhyNotItem(option=s.option, reason=why_not(s)) for s in alts],
        assumptions=list(dict.fromkeys([*rec.assumptions, *ss.assumptions])),   # both carry the market note
        action=NextAction(type=type_, label=label, autonomy_level=AutonomyLevel.L3),
        guardian=verdict, review=REVIEWS.get(c.id, Review(status=Status3.pending)), generated_at=AS_OF, trace_id=trace_id)
