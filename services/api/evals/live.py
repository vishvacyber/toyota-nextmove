"""Opt-in live persona evals on the real Claude Agent SDK (spends subscription quota; pytest never runs this).

    pnpm --filter @nextmove/api evals:live            # 3 asks + 3 recommendation explanations
"""

import asyncio
import sys
import time

from agents import orchestrator, recommend, sdk, traces
from app.models import AdvisorAsk
from evals.cases import CASES, failures
from tools.customer import customer


async def main() -> int:
    bad = 0
    only = [a for a in sys.argv[1:] if a.startswith("CUST-")]
    for case in [c for c in CASES if not only or c["customer_id"] in only]:
        c, t0 = customer(case["customer_id"]), time.monotonic()
        try:
            a = await orchestrator.ask(AdvisorAsk(customer_id=c.id, message=case["question"]))
            tr = traces.MEMORY[-1]
            r = await recommend.recommendation(c)
        except sdk.Busy as e:
            print(f"FAIL {c.id}: busy ({e})")
            bad += 1
            continue
        f = failures(case, a, tr, r.recommended.option.value)
        bad += bool(f)
        print(f"{'PASS' if not f else 'FAIL'} {c.id} {tr.agent.root} {tr.model} {time.monotonic() - t0:.1f}s "
              f"guardian={a.guardian.verdict.value} {f or ''}\n  {a.answer}\n  why: {r.why}\n"
              + (f"  plan: {tr.plan}\n" if f else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
