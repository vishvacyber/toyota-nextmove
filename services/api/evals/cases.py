"""Persona eval cases, shared by the offline test (fake SDK) and the live run (python -m evals.live)."""

from app.models import AdvisorAnswer, AgentTrace

CASES = [
    {"customer_id": "CUST-VISHWAA2026", "question": "What should I do at lease end?", "agent": "advisor",
     "keywords": ["lease", "end", "buy", "buyout", "return", "do"], "recommended": "buyout",
     "tools": ["run_scenario"], "action": ("L1", "executed")},
    {"customer_id": "CUST-SAMEERA2026", "question": "Should I upgrade to a hybrid now or keep my Camry?", "agent": "advisor",
     "keywords": ["upgrade", "hybrid", "keep", "trade", "camry", "equity"], "recommended": "upgrade",
     "tools": ["run_scenario"], "action": ("L1", "executed")},
    {"customer_id": "CUST-HUNG2026", "question": "I missed a payment after changing jobs. What can I do?", "agent": "hardship",
     "keywords": ["missed", "payment", "late", "job", "defer", "deferral", "help"], "recommended": "due_date_change",
     "tools": ["run_scenario", "handoff_to_human"], "action": ("L4", "escalated")},
]


def failures(case: dict, answer: AdvisorAnswer, trace: AgentTrace, recommended: str) -> list[str]:
    out = []
    if answer.guardian.verdict.value != "pass":
        out.append(f"guardian {answer.guardian.verdict.value}: {[c.detail for c in answer.guardian.checks if not c.passed]}")
    if trace.agent.root != case["agent"]:
        out.append(f"routed to {trace.agent.root}")
    if recommended != case["recommended"]:
        out.append(f"engine recommended {recommended}")
    called = {t.tool for t in trace.tool_calls}
    out += [f"missing tool call {t}" for t in case["tools"] if t not in called]
    if (trace.action.autonomy_level.value, trace.action.status.value) != case["action"]:
        out.append(f"action {trace.action.autonomy_level.value}/{trace.action.status.value}")
    if "approved" in answer.answer.lower() and case["agent"] == "hardship":
        out.append("hardship answer claims an approval")
    return out
