"""Autonomy levels (CLAUDE.md rule 3): L1 read = auto · L2 draft = auto + visible · L3 customer-facing = consent or
employee approval · L4 money/credit = humans only, never an agent."""

from app.models import AutonomyLevel, Status8
from tools import REGISTRY

AGENTS = {"orchestrator", "advisor", "sentinel", "hardship", "market_intel", "guardian"}
# Tools each SDK agent may call. Nothing L4 exists; deferral decisions go to handoff_to_human, called by code.
AGENT_TOOLS = {
    "advisor": ["get_customer", "run_scenario", "check_eligibility", "get_market_value", "find_dealer", "get_recalls",
                "get_timing", "book_appointment"],
    "hardship": ["get_customer", "run_scenario", "check_eligibility"],
}
assert all(REGISTRY[n].autonomy in (AutonomyLevel.L1, AutonomyLevel.L3) for ts in AGENT_TOOLS.values() for n in ts)


def gate(level: AutonomyLevel, consent: bool | None = None, approved_by: str | None = None) -> Status8:
    """What happens to an action at this level. An agent name never counts as an approver."""
    if level == AutonomyLevel.L4:
        return Status8.escalated
    if level == AutonomyLevel.L3 and not consent and (not approved_by or approved_by in AGENTS):
        return Status8.pending_approval
    return Status8.executed
