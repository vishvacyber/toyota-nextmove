"""Opt-in live persona evals on the real Claude Agent SDK (spends subscription quota; pytest never runs this).

    pnpm --filter @nextmove/api evals:live            # 3 asks
    pnpm --filter @nextmove/api evals:live --save     # + 3 recommendation whys, written to agents/fallback.json
"""

import asyncio
import sys
import time

from agents import fallback, guardian, orchestrator, recommend, sdk, traces
from agents.autonomy import AGENT_TOOLS
from agents.prompts import PROMPTS
from app.models import AdvisorAsk
from evals.cases import CASES, failures
from tools.customer import customer

WHY_ASK = ("In 2 or 3 sentences, explain why the engine-recommended option is the smartest next move for this "
           "customer, using numbers exactly as your tools return them.")


async def main(save: bool) -> int:
    answers, whys, bad = {}, {}, 0
    only = [a for a in sys.argv[1:] if a.startswith("CUST-")]
    for case in [c for c in CASES if not only or c["customer_id"] in only]:
        t0 = time.monotonic()
        a = await orchestrator.ask(AdvisorAsk(customer_id=case["customer_id"], message=case["question"]))
        tr = traces.MEMORY[-1]
        rec = recommend.recommendation(customer(case["customer_id"])).recommended.option.value
        f = failures(case, a, tr, rec) + (["served a fallback, not the live model"] if tr.model.startswith(("fallback", "none")) else [])
        bad += bool(f)
        print(f"{'PASS' if not f else 'FAIL'} {case['customer_id']} {tr.agent.root} {tr.model} "
              f"{time.monotonic() - t0:.1f}s guardian={a.guardian.verdict.value} {f or ''}\n  {a.answer}\n"
              + (f"  plan: {tr.plan}\n" if f else ""))
        if not f:
            calls = [t.model_dump(mode="json") for t in tr.tool_calls]
            answers[case["customer_id"]] = [{"question": case["question"], "keywords": case["keywords"],
                                             "agent": case["agent"], "answer": a.answer, "tool_calls": calls,
                                             "trace_id": tr.id}]
        if save:
            t0 = time.monotonic()
            c = customer(case["customer_id"])
            try:
                run = await sdk.run(PROMPTS["advisor"][1], orchestrator.prompt(c, WHY_ASK, "en", []), AGENT_TOOLS["advisor"])
            except sdk.SdkUnavailable as e:
                print(f"FAIL why {c.id}: {e}")
                bad += 1
                continue
            v, _ = guardian.check(f"{run.text} {guardian.DISCLOSURE}", orchestrator.outputs(run.tool_calls))
            print(f"{'PASS' if v.verdict == 'pass' else 'FAIL'} why {c.id} {time.monotonic() - t0:.1f}s\n  {run.text}\n")
            if v.verdict == "pass":
                whys[c.id] = {"why": run.text, "tool_calls": [t.model_dump(mode="json") for t in run.tool_calls]}
            else:
                bad += 1
    if save and (answers or whys):
        old = fallback.data()   # merge, so a rerun of one persona keeps the others
        fallback.save({**old["answers"], **answers}, {**old["whys"], **whys})
        print(f"Saved {fallback.PATH}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--save" in sys.argv)))
