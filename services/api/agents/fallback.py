"""Pre-generated, Guardian-passed persona answers (SPEC §12). Served when the SDK fails or hits the subscription's
rate limit, and used as the cached `why` on recommendations. Written by `python -m evals.live --save`."""

import json
import re
from functools import cache
from pathlib import Path

PATH = Path(__file__).with_name("fallback.json")
WORD = re.compile(r"\w+")


@cache   # shortcut: read once per process; restart after --save
def data() -> dict:
    return json.loads(PATH.read_text(encoding="utf-8")) if PATH.exists() else {"answers": {}, "whys": {}}


def _outputs(entry: dict) -> list[tuple[str, dict]]:
    return [(t["tool"], t["output"]) for t in entry["tool_calls"]]


def why(customer_id: str) -> dict | None:
    e = data()["whys"].get(customer_id)
    return e and {"why": e["why"], "tool_outputs": _outputs(e), "trace_id": e.get("trace_id")}


def answer(customer_id: str, message: str) -> dict | None:
    """The persona answer whose keywords best match the question; None if no keyword matches."""
    words = set(WORD.findall(message.lower()))
    scored = [(len(words & set(e["keywords"])), e) for e in data()["answers"].get(customer_id, [])]
    best = max(scored, key=lambda x: x[0], default=(0, None))
    return best[1] if best[0] else None


def save(answers: dict, whys: dict) -> None:
    PATH.write_text(json.dumps({"answers": answers, "whys": whys}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    data.cache_clear()
