"""Run one tool alone:  uv run python -m tools <name> '<json args>'   (no args: list the tools)."""

import json
import sys

from tools import REGISTRY, call

if len(sys.argv) < 2:
    for t in REGISTRY.values():
        print(f"{t.name:20} {t.autonomy.value}  {t.description.splitlines()[0]}")
else:
    print(json.dumps(call(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}), indent=2))
