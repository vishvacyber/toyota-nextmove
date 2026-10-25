"""Every operation in the frozen contract must exist on the API, so no endpoint is silently left to the mocks."""

import re
from pathlib import Path

import yaml
from fastapi.routing import APIRoute

from app.main import app

SPEC = Path(__file__).parents[3] / "packages/contracts/openapi.yaml"


def norm(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "{}", path)


def test_every_contract_operation_has_a_route():
    spec = yaml.safe_load(SPEC.read_text())
    wanted = {(m.upper(), norm(p)) for p, ops in spec["paths"].items() for m in ops
              if m in ("get", "post", "put", "patch", "delete")}
    have = {(m, norm(r.path)) for r in app.routes if isinstance(r, APIRoute) for m in r.methods}
    assert len(wanted) == 34   # update when the contract changes (it is frozen after Stage 0)
    assert not wanted - have, f"Contract operations with no API route: {sorted(wanted - have)}"
