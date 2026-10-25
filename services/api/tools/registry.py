"""One tool registry for every LLM provider (CLAUDE.md: Grok primary, Claude Agent SDK fallback).

Each tool is a plain Python function taking one Pydantic input model. The JSON schema comes from that model,
so OpenAI-style function calling (Grok) and MCP (Claude) see the same definition. Tools only fetch data or
compute through the engine; none invents a number.
"""

import inspect
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from app.models import AutonomyLevel


class ToolError(ValueError):
    """Bad input the model can correct (unknown customer, cache miss offline, ...)."""


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_model: type[BaseModel]
    fn: Callable[[Any], Any]
    autonomy: AutonomyLevel

    @property
    def schema(self) -> dict:
        return self.input_model.model_json_schema()


REGISTRY: dict[str, Tool] = {}


def tool(autonomy: AutonomyLevel = AutonomyLevel.L1):
    def register(fn: Callable) -> Callable:
        model = next(iter(inspect.signature(fn).parameters.values())).annotation
        REGISTRY[fn.__name__] = Tool(fn.__name__, inspect.cleandoc(fn.__doc__ or ""), model, fn, autonomy)
        return fn
    return register


def _json(x: Any) -> Any:
    if isinstance(x, BaseModel):
        return x.model_dump(mode="json")
    if isinstance(x, list):
        return [_json(i) for i in x]
    if isinstance(x, dict):
        return {k: _json(v) for k, v in x.items()}
    return x


def call(name: str, args: dict | None = None) -> dict:
    """Validate args against the tool's input model, run it, return JSON-able output."""
    if name not in REGISTRY:
        raise ToolError(f"Unknown tool {name}")
    t = REGISTRY[name]
    return _json(t.fn(t.input_model.model_validate(args or {})))


def openai_tools() -> list[dict]:
    """Tool definitions in OpenAI / xAI function-calling format (for the B3 Grok provider)."""
    return [{"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.schema}}
            for t in REGISTRY.values()]
