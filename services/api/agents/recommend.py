"""GET /customers/{id}/recommendation. The engine's scenarios decide; the option is picked by fixed rules, never by
the LLM (rule 1). The explanation is AI-native: the Advisor writes `why` and a reason for each alternative from its
own tool calls, the Guardian checks every number, and the result is cached per customer and per set of engine
numbers (memory + Supabase), so it is written once and only rewritten when the numbers change. There is no
pre-written fallback: if nothing checked is ready, the API answers 503 and the app offers a retry."""

import asyncio
import hashlib
import json
import re
import time
from datetime import UTC, datetime

from agents import guardian, sdk, traces
from agents.autonomy import AGENT_TOOLS
from agents.prompts import PROMPTS
from app.models import (
    Action,
    AgentName,
    AgentTrace,
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
    Status8,
    Type1,
    Verdict,
    WhyNotItem,
)
from engine import scenarios
from engine.scenarios import AS_OF
from tools import store
from tools.actions import new_id

O = OptionType
REVIEWS: dict[str, Review] = {}   # customer_id → latest employee review (NextMove Review)
EXPLANATIONS: dict[str, dict] = {}   # cache key → {"why", "why_not", "trace_id", "outputs"}
LOCKS: dict[str, asyncio.Lock] = {}
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


def next_action(rec: Scenario) -> NextAction:
    type_, label = ACTIONS.get(rec.option, (Type1.book_appointment, "Book a check-in"))
    return NextAction(type=type_, label=label, autonomy_level=AutonomyLevel.L3)


def headline(c: Customer, s: Scenario) -> str:
    return {O.buyout: f"Buying your {c.vehicle.model} beats returning it", O.return_: f"Returning your {c.vehicle.model} is your best move",
            O.upgrade: f"{s.label} and put your equity to work", O.trade_in: "Trading in puts your equity to work",
            O.refinance: "Refinancing with TFS lowers your payment", O.due_date_change: "Move your due date to match your payday",
            O.extend: "A longer term lowers your payment"}.get(s.option, "You're on track, no change needed")


def parts(c: Customer) -> tuple[ScenarioSet, Scenario, Scenario | None, list[Scenario]]:
    ss = scenario_set(c)
    rec = pick(c.situation, ss)
    baseline = next((s for s in ss.scenarios if s.option == O.do_nothing), None)
    return ss, rec, baseline, [s for s in ss.scenarios if s.option not in (rec.option, O.do_nothing)]


def cache_key(c: Customer, ss: ScenarioSet) -> str:
    """Same customer + same engine numbers → same explanation. Any number change makes a new key."""
    nums = json.dumps([s.model_dump(mode="json") for s in ss.scenarios], sort_keys=True)
    return f"{c.id}:{hashlib.sha1(nums.encode()).hexdigest()[:12]}"


def hydrate() -> None:
    for row in store.load("explanations"):
        EXPLANATIONS[row["key"]] = row


def check_text(why: str, why_not: dict[str, str], ss: ScenarioSet) -> str:
    return "\n".join([why, *why_not.values(), *ss.assumptions])   # assumptions carry the estimate disclosure


def prompt(c: Customer, rec: Scenario, alts: list[Scenario], feedback: str) -> str:
    lines = [f"Customer ID: {c.id}", f"Situation: {c.situation.value}",
             f"Engine-recommended option: {rec.option.value} ({rec.label})",
             "Alternatives to explain: " + (", ".join(f"{s.option.value} ({s.label})" for s in alts) or "none"),
             "Call run_scenario for this customer first; use only numbers your tools return."]
    if feedback:
        lines.append(f"Your previous draft was sent back by the compliance check: {feedback}. Rewrite it; drop any "
                     "number a tool did not return, including differences or totals you worked out yourself.")
    return "\n".join(lines)


def parse(text: str, alts: list[Scenario]) -> tuple[str, dict[str, str]]:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    data = json.loads(m.group(0)) if m else {}
    why = str(data.get("why", "")).strip()
    reasons = data.get("why_not") or {}
    why_not = {s.option.value: str(reasons.get(s.option.value, "")).strip() for s in alts}
    missing = [o for o, r in why_not.items() if not r]
    if not why or missing:
        raise ValueError("missing " + ", ".join((["why"] if not why else []) + [f"why_not.{o}" for o in missing]))
    return why, why_not


async def explain(c: Customer, ss: ScenarioSet, rec: Scenario, alts: list[Scenario]) -> dict:
    key = cache_key(c, ss)
    if key in EXPLANATIONS:
        return EXPLANATIONS[key]
    async with LOCKS.setdefault(key, asyncio.Lock()):
        if key in EXPLANATIONS:   # another request wrote it while we waited
            return EXPLANATIONS[key]
        version, system = PROMPTS["explainer"]
        started, t0, plan, feedback = datetime.now(UTC), time.monotonic(), ["Explain the engine's recommendation"], ""
        result, calls, model, verdict = None, [], sdk.MODEL, None
        for attempt in range(2):   # one send-back on `revise`, like the Advisor
            try:
                run = await sdk.run(system, prompt(c, rec, alts, feedback), AGENT_TOOLS["explainer"])
            except sdk.SdkUnavailable as e:
                plan.append(f"SDK unavailable: {e}")
                break
            calls, model = run.tool_calls, run.model
            try:
                why, why_not = parse(run.text, alts)
            except ValueError as e:
                feedback = f"reply with only the JSON object ({e})"
                plan.append(f"Unreadable draft (attempt {attempt + 1}): {e}")
                continue
            outputs = [(t.tool, t.output) for t in calls] + [("run_scenario", ss.model_dump(mode="json"))]
            verdict, _ = guardian.check(check_text(why, why_not, ss), outputs)
            if verdict.verdict == Verdict.pass_:
                result = {"key": key, "why": why, "why_not": why_not, "outputs": [[t, o] for t, o in outputs]}
                break
            feedback = "; ".join(ch.detail or ch.name.value for ch in verdict.checks if not ch.passed)
            plan.append(f"Guardian {verdict.verdict.value} (attempt {attempt + 1}): {feedback}")
        tid = f"TR-{new_id('EXP')}"
        traces.write(AgentTrace(
            id=tid, agent=AgentName("advisor"), customer_id=c.id, started_at=started,
            duration_ms=round((time.monotonic() - t0) * 1000), plan=plan, tool_calls=calls,
            guardian=verdict or guardian.check("", [])[0],
            action=Action(type="explain_recommendation", autonomy_level=AutonomyLevel.L1,
                          status=Status8.executed if result else Status8.blocked),
            model=model, prompt_version=version))
        if result is None:
            raise sdk.Busy("NextMove is still working on this explanation. Please try again in a moment.")
        result["trace_id"] = tid
        EXPLANATIONS[key] = result
        store.save("explanations", key, result)
        return result


def build(c: Customer, ss: ScenarioSet, rec: Scenario, baseline: Scenario | None, alts: list[Scenario], ex: dict) -> Recommendation:
    outputs = [(t, o) for t, o in ex["outputs"]]
    verdict, _ = guardian.check(check_text(ex["why"], ex["why_not"], ss), outputs)
    return Recommendation(
        customer_id=c.id, situation=c.situation, headline=headline(c, rec), recommended=rec, alternatives=alts,
        baseline=baseline, why=ex["why"], why_not=[WhyNotItem(option=s.option, reason=ex["why_not"][s.option.value]) for s in alts],
        assumptions=list(dict.fromkeys([*rec.assumptions, *ss.assumptions])),   # both carry the market note
        action=next_action(rec), guardian=verdict, review=REVIEWS.get(c.id, Review(status=Status3.pending)),
        generated_at=AS_OF, trace_id=ex.get("trace_id"))


async def recommendation(c: Customer) -> Recommendation:
    ss, rec, baseline, alts = parts(c)
    return build(c, ss, rec, baseline, alts, await explain(c, ss, rec, alts))


def cached_trace_id(c: Customer) -> str | None:
    return EXPLANATIONS.get(cache_key(c, scenario_set(c)), {}).get("trace_id")


async def warm(customer_ids: list[str]) -> None:
    """Write the explanations the demo needs before anyone asks (once per engine-number change, saved in Supabase)."""
    from tools.customer import customer
    for cid in customer_ids:
        try:
            await recommendation(customer(cid))
        except sdk.Busy:
            pass   # the page will retry
