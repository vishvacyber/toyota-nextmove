"""Market Intel (run on schedule: uv run --env-file ../../.env.local python -m agents.market_intel): refreshes market values, recalls and dealers for every model from the SerpApi cache (rule 9) and
records what it found. Cache misses go live (max 10 per process, off with NEXTMOVE_OFFLINE=1). Deterministic code; the numbers it reads carry their source and as-of."""

import time
from datetime import UTC, datetime

from agents import guardian, traces
from agents.autonomy import gate
from app.models import Action, AgentName, AgentTrace, AutonomyLevel, Model, ToolCall
from tools import call
from tools.actions import new_id


def run() -> AgentTrace:
    started, t0, calls = datetime.now(UTC), time.monotonic(), []
    for m in Model:
        s = time.monotonic()
        q = call("get_market_value", {"model": m.value})
        calls.append(ToolCall(tool="get_market_value", input={"model": m.value}, duration_ms=round((time.monotonic() - s) * 1000),
                              output={k: q[k] for k in ("model", "year", "estimated_value", "source", "as_of", "cached")}
                              | {"recalls": [r["title"] for r in q["recalls"]]}))
    flagged = [c.output["model"] for c in calls if c.output["recalls"]]
    summary = "Refreshed market values. Recall headlines for: " + (", ".join(flagged) or "none") + f". {guardian.DISCLOSURE}"
    verdict, _ = guardian.check(summary, [(c.tool, c.output) for c in calls])
    return traces.write(AgentTrace(
        id=f"TR-{new_id('MKT')}", agent=AgentName("market_intel"), started_at=started,
        duration_ms=round((time.monotonic() - t0) * 1000),
        plan=["Read cached SerpApi comps, recalls and dealers per model", "Flag recall headlines"], tool_calls=calls,
        guardian=verdict, action=Action(type="refresh_market", autonomy_level=AutonomyLevel.L1, status=gate(AutonomyLevel.L1)),
        model="deterministic", prompt_version="market_intel@v1"))


if __name__ == "__main__":
    t = run()
    print(t.id, t.guardian.verdict.value, [(c.output["model"], c.output["estimated_value"], c.output["cached"]) for c in t.tool_calls])
