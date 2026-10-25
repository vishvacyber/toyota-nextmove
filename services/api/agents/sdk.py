"""Claude Agent SDK runner, locked down: the model sees only the B2 tool registry, mounted in-process.

No built-in tools (Bash, file, web), no user/project settings, no other MCP servers, and every tool outside the
agent's allowlist is denied. Auth is the separate subscription login in CLAUDE_CONFIG_DIR, never an API key.
"""

import asyncio
import json
import os
import tempfile
import time
from dataclasses import dataclass, field
from functools import cache

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKError,
    ResultMessage,
    SystemMessage,
    create_sdk_mcp_server,
    query,
)
from claude_agent_sdk import tool as sdk_tool
from pydantic import ValidationError

from app.models import ToolCall
from tools import REGISTRY, ToolError, call

SERVER = "nextmove"
PREFIX = f"mcp__{SERVER}__"
MODEL = os.environ.get("NEXTMOVE_MODEL", "claude-sonnet-5-5")
TIMEOUT_S = 60


class SdkUnavailable(RuntimeError):
    """SDK failed, timed out or hit the subscription's rate limit: serve the fallback."""


@dataclass
class Run:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    model: str = MODEL
    duration_ms: int = 0
    init_tools: list[str] = field(default_factory=list)


def mcp_server(names: list[str], log: list[ToolCall]):
    """In-process MCP server over the agent's tools; each call is recorded for the trace and the Guardian."""
    def wrap(t):
        async def handler(args: dict) -> dict:
            start = time.monotonic()
            try:
                out, err = call(t.name, args), False
            except (ToolError, ValidationError) as e:   # the model can correct its input
                out, err = {"error": str(e)}, True
            log.append(ToolCall(tool=t.name, input=args, output=out if isinstance(out, dict) else {"result": out},
                                duration_ms=round((time.monotonic() - start) * 1000)))
            return {"content": [{"type": "text", "text": json.dumps(out)}], "is_error": err}
        return sdk_tool(t.name, t.description, t.schema)(handler)
    return create_sdk_mcp_server(SERVER, tools=[wrap(REGISTRY[n]) for n in names])


@cache
def _empty_cwd() -> str:
    return tempfile.mkdtemp(prefix="nextmove-agent-")


def options(system: str, names: list[str], log: list[ToolCall]) -> ClaudeAgentOptions:
    return ClaudeAgentOptions(
        system_prompt=system,
        model=MODEL,
        tools=[],                                   # no Claude Code built-ins at all
        allowed_tools=[PREFIX + n for n in names],
        permission_mode="dontAsk",                  # anything not pre-approved above is denied
        mcp_servers={SERVER: mcp_server(names, log)},
        strict_mcp_config=True,                     # ignore any MCP config on disk
        setting_sources=[],                         # no user/project/local settings, CLAUDE.md or skills
        plugins=[],
        cwd=_empty_cwd(),
        max_turns=8,
        env={"CLAUDE_CONFIG_DIR": os.environ.get("CLAUDE_CONFIG_DIR", ""), "ANTHROPIC_API_KEY": ""},
    )


async def _run(system: str, prompt: str, names: list[str]) -> Run:
    log: list[ToolCall] = []
    start, run = time.monotonic(), Run(text="")
    async for m in query(prompt=prompt, options=options(system, names, log)):
        if isinstance(m, SystemMessage) and m.subtype == "init":
            run.init_tools = list(m.data.get("tools", []))
        elif isinstance(m, AssistantMessage):
            run.model = m.model or run.model
        elif isinstance(m, ResultMessage):
            if m.is_error or m.subtype != "success" or not m.result:
                raise SdkUnavailable(f"{m.subtype} (status {m.api_error_status})")
            run.text = m.result.strip()
    run.tool_calls, run.duration_ms = log, round((time.monotonic() - start) * 1000)
    if any(not t.startswith(PREFIX) for t in run.init_tools):
        raise SdkUnavailable(f"Non-registry tool reachable: {run.init_tools}")   # lockdown broke: refuse the run
    return run


async def run(system: str, prompt: str, names: list[str]) -> Run:
    if not os.environ.get("CLAUDE_CONFIG_DIR"):
        raise SdkUnavailable("CLAUDE_CONFIG_DIR not set")
    os.environ.pop("ANTHROPIC_API_KEY", None)   # never bill an API key; the subscription login only
    try:
        return await asyncio.wait_for(_run(system, prompt, names), TIMEOUT_S)
    except (ClaudeSDKError, TimeoutError, OSError) as e:
        raise SdkUnavailable(type(e).__name__) from e
