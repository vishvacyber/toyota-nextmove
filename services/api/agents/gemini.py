"""Gemini, the primary LLM, over the same tool registry as the Claude Agent SDK.

Plain REST (`generateContent`, httpx; no extra SDK). Same contract as `agents.sdk.run`: it returns an `sdk.Run`
with the final text and every tool call, so the Guardian, traces and autonomy rules don't care which provider
answered. Only registry tools are declared, so nothing else is reachable. Any failure raises `sdk.SdkUnavailable`
and the caller (agents.llm) falls back to Claude.
"""

import asyncio
import os
import time

import httpx

from agents import sdk
from app.models import ToolCall
from tools import REGISTRY, ToolError, call

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
KEEP = {"type", "description", "properties", "required", "items", "enum", "format", "nullable", "minimum", "maximum",
        "minItems", "maxItems"}


def model() -> str:
    return os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"


def available() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def clean(schema: dict, defs: dict | None = None) -> dict:
    """Pydantic JSON schema → the OpenAPI subset Gemini accepts: inline $refs, Optional → nullable, drop the rest."""
    defs = schema.get("$defs", defs or {})
    if "$ref" in schema:
        return clean(defs[schema["$ref"].split("/")[-1]], defs)
    if "anyOf" in schema:
        kinds = [s for s in schema["anyOf"] if s.get("type") != "null"]
        out = clean(kinds[0], defs) if kinds else {"type": "string"}
        out["nullable"] = len(kinds) < len(schema["anyOf"]) or out.get("nullable", False)
        return {**out, **({"description": schema["description"]} if "description" in schema else {})}
    out = {k: v for k, v in schema.items() if k in KEEP}
    if "properties" in out:
        out["properties"] = {k: clean(v, defs) for k, v in out["properties"].items()}
    if "items" in out:
        out["items"] = clean(out["items"], defs)
    if out.get("type") == "integer" and "format" in out:
        out.pop("format")
    if out.get("format") not in (None, "date-time", "enum"):
        out.pop("format", None)
    return out


def declarations(names: list[str]) -> list[dict]:
    return [{"name": n, "description": REGISTRY[n].description, "parameters": clean(REGISTRY[n].schema)} for n in names]


def parts(prompt: str | list[dict]) -> list[dict]:
    """Text, or the Anthropic-style content blocks the vision agent builds (text + base64 images)."""
    if isinstance(prompt, str):
        return [{"text": prompt}]
    return [{"text": b["text"]} if b["type"] == "text" else
            {"inlineData": {"mimeType": b["source"]["media_type"], "data": b["source"]["data"]}} for b in prompt]


async def _post(body: dict, timeout: float) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(API.format(model=model()), json=body,
                                headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]})   # key in a header, never a URL
        res.raise_for_status()
        return res.json()


async def _run(system: str, prompt: str | list[dict], names: list[str], max_turns: int, timeout: float) -> sdk.Run:
    start, log = time.monotonic(), []
    contents = [{"role": "user", "parts": parts(prompt)}]
    body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents,
            "generationConfig": {"temperature": 0.2}}
    if names:
        body["tools"] = [{"functionDeclarations": declarations(names)}]
    for _ in range(max_turns):
        data = await _post(body, timeout)
        cands = data.get("candidates") or []
        content = cands[0].get("content") if cands else None
        if not content or not content.get("parts"):
            raise sdk.SdkUnavailable(f"empty answer ({(cands[0].get('finishReason') if cands else data.get('promptFeedback'))})")
        calls = [p["functionCall"] for p in content["parts"] if "functionCall" in p]
        if not calls:
            text = "".join(p.get("text", "") for p in content["parts"] if not p.get("thought")).strip()
            if not text:
                raise sdk.SdkUnavailable("no text in answer")
            return sdk.Run(text=text, tool_calls=log, model=data.get("modelVersion") or model(),
                           duration_ms=round((time.monotonic() - start) * 1000))
        contents.append(content)   # echo the model turn as-is (keeps any thought signatures)
        replies = []
        for fc in calls:
            name, args, t0 = fc["name"], fc.get("args") or {}, time.monotonic()
            if name not in names:   # only declared registry tools may run
                out = {"error": f"Tool {name} is not available"}
            else:
                try:
                    out = call(name, args)
                except (ToolError, ValueError) as e:
                    out = {"error": str(e)}
            log.append(ToolCall(tool=name, input=args, output=out if isinstance(out, dict) else {"result": out},
                                duration_ms=round((time.monotonic() - t0) * 1000)))
            replies.append({"functionResponse": {"name": name, "response": out if isinstance(out, dict) else {"result": out}}})
        contents.append({"role": "user", "parts": replies})
    raise sdk.SdkUnavailable("too many tool turns")


async def run(system: str, prompt: str | list[dict], names: list[str], timeout: float = sdk.TIMEOUT_S,
              max_turns: int = 8) -> sdk.Run:
    if not available():
        raise sdk.SdkUnavailable("GEMINI_API_KEY not set")
    try:
        return await asyncio.wait_for(_run(system, prompt, names, max_turns, timeout), timeout)
    except (httpx.HTTPError, TimeoutError, KeyError, ValueError) as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        raise sdk.SdkUnavailable(f"gemini {type(e).__name__}{f' {status}' if status else ''}") from e
