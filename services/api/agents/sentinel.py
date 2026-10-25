"""Sentinel: daily scan. Detects triggers, ranks the console queue and drafts outreach (L2: saved as `draft` alerts,
visible in the console, sent only after consent or employee approval). Deterministic code: 1,200 LLM calls per scan
would drain the subscription, and every number here comes from the engine anyway."""

import time
from datetime import UTC, datetime
from functools import cache

from agents import guardian, recommend, traces
from agents.autonomy import gate
from app.models import (
    Action,
    AgentName,
    AgentTrace,
    Alert,
    AlertStatus,
    AutonomyLevel,
    GuardianVerdict,
    Opportunity,
    Situation,
    ToolCall,
    Verdict,
)
from engine import nba, scenarios
from engine.scenarios import TODAY, usd
from sim.generator import customers_by_id
from tools.actions import new_id

ALERTS: dict[str, Alert] = {}
DRAFTS_PER_SCAN = 25
URGENT = {Situation.payment_stress, Situation.lease_end}


def reason(c, rec) -> str:
    k = c.contract
    return {Situation.lease_end: f"Lease ends in {(k.maturity_date - TODAY).days} days",
            Situation.payment_stress: f"{k.days_past_due} days past due",
            Situation.positive_equity: f"{usd(rec.equity)} positive equity",
            Situation.rate_drop: f"Current APR {k.apr}% vs a lower TFS refinance rate",
            Situation.mileage_overage: "On pace to exceed the lease mileage allowance",
            Situation.early_payoff: "Loan ends within 6 months",
            Situation.ev_switch: "High-mileage gas vehicle; electrified option available",
            Situation.life_event: "Recent life event"}.get(c.situation, "Situation detected")


@cache   # deterministic: same engine date, same customers
def scan() -> list[Opportunity]:
    out = []
    for c in customers_by_id().values():
        if c.situation == Situation.none:
            continue
        rec = recommend.pick(c.situation, recommend.scenario_set(c))
        nba_ = nba.score(c, rec)
        days = (c.contract.maturity_date - TODAY).days if c.contract.type.value == "lease" else None
        out.append(Opportunity(
            customer_id=c.id, customer_name=f"{c.first_name} {c.last_name}", model=c.vehicle.model, situation=c.situation,
            next_best_action=rec.option, expected_value=nba_["expected_value"],
            retention_odds=nba_["retention_odds"], days_to_maturity=days,
            script=recommend.headline(c, rec), reason=reason(c, rec),
            priority=1 if c.situation in URGENT else 2 if rec.option.value != "do_nothing" else 3))
    personas = {"CUST-VISHWAA2026", "CUST-SAMEERA2026", "CUST-HUNG2026"}   # demo personas lead their priority band
    return sorted(out, key=lambda o: (o.priority, o.customer_id not in personas, -o.expected_value))


def run() -> AgentTrace:
    started, t0 = datetime.now(UTC), time.monotonic()
    opps, tid = scan(), f"TR-{new_id('SEN')}"
    verdicts = []
    for o in opps[:DRAFTS_PER_SCAN]:
        c = customers_by_id()[o.customer_id]
        ss = recommend.scenario_set(c)
        body = f"{o.script}. {o.reason}. Want to see your options? {guardian.DISCLOSURE}"
        v, _ = guardian.check(body, [("run_scenario", ss.model_dump(mode="json")),
                                     ("engine_facts", scenarios.facts(c))])
        verdicts.append(v)
        if v.verdict != Verdict.pass_:
            continue   # never queue a draft the Guardian rejects
        a = Alert(id=new_id("ALR"), customer_id=c.id, type=o.situation, title=o.script, body=body,
                  autonomy_level=AutonomyLevel.L2, status=AlertStatus.draft, drafted_by=AgentName("sentinel"),
                  trace_id=tid, created_at=started)
        ALERTS[a.id] = a
    rank = {Verdict.pass_: 0, Verdict.revise: 1, Verdict.block: 2}
    worst = max(verdicts, key=lambda v: rank[v.verdict], default=GuardianVerdict(verdict=Verdict.pass_, checks=[]))
    return traces.write(AgentTrace(
        id=tid, agent=AgentName("sentinel"), started_at=started, duration_ms=round((time.monotonic() - t0) * 1000),
        plan=[f"Scan {len(customers_by_id())} customers", f"Rank {len(opps)} opportunities",
              f"Draft outreach for the top {DRAFTS_PER_SCAN} (L2, needs approval or consent to send)"],
        tool_calls=[ToolCall(tool="run_scenario", input={"batch": len(customers_by_id())},
                             output={"opportunities": len(opps), "drafts": sum(v.verdict == Verdict.pass_ for v in verdicts)},
                             duration_ms=round((time.monotonic() - t0) * 1000))],
        guardian=worst, action=Action(type="draft_outreach", autonomy_level=AutonomyLevel.L2, status=gate(AutonomyLevel.L2)),
        model="deterministic", prompt_version="sentinel@v1"))
