import asyncio
import json

import pytest

from agents import gemini, llm, sdk
from tools import REGISTRY


def walk(schema):
    yield schema
    for v in schema.get("properties", {}).values():
        yield from walk(v)
    if "items" in schema:
        yield from walk(schema["items"])


def test_every_tool_schema_is_gemini_compatible():
    for d in gemini.declarations(list(REGISTRY)):
        for node in walk(d["parameters"]):
            assert not {"$ref", "$defs", "anyOf", "title", "default", "examples", "additionalProperties"} & set(node), d["name"]
            assert "type" in node, (d["name"], node)


def scripted(*turns):
    """Fake generateContent: returns the scripted model turns in order and records each request body."""
    seen = []

    async def post(body, timeout):
        seen.append(json.loads(json.dumps(body)))
        return {"modelVersion": "gemini-test", "candidates": [{"content": {"role": "model", "parts": turns[len(seen) - 1]}}]}
    return post, seen


def test_tool_loop_records_calls_and_returns_text(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    post, seen = scripted([{"functionCall": {"name": "run_scenario", "args": {"customer_id": "CUST-JAMES"}}}],
                          [{"text": "Upgrade to the Camry SE Hybrid."}])
    monkeypatch.setattr(gemini, "_post", post)
    run = asyncio.run(gemini.run("sys", "Customer ID: CUST-JAMES", ["get_customer", "run_scenario"]))
    assert run.text == "Upgrade to the Camry SE Hybrid." and run.model == "gemini-test"
    assert [t.tool for t in run.tool_calls] == ["run_scenario"] and "scenarios" in run.tool_calls[0].output
    reply = seen[1]["contents"][-1]["parts"][0]["functionResponse"]
    assert reply["name"] == "run_scenario" and "scenarios" in reply["response"]
    assert [f["name"] for f in seen[0]["tools"][0]["functionDeclarations"]] == ["get_customer", "run_scenario"]


def test_undeclared_tool_is_refused(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    post, _ = scripted([{"functionCall": {"name": "handoff_to_human", "args": {}}}], [{"text": "ok"}])
    monkeypatch.setattr(gemini, "_post", post)
    run = asyncio.run(gemini.run("sys", "hi", ["get_customer"]))
    assert run.tool_calls[0].output == {"error": "Tool handoff_to_human is not available"}


def test_images_become_inline_data():
    p = gemini.parts([{"type": "text", "text": "Photo 1"},
                      {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAA"}}])
    assert p == [{"text": "Photo 1"}, {"inlineData": {"mimeType": "image/png", "data": "AAA"}}]


def test_gemini_failure_falls_back_to_claude(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test")

    async def broken(body, timeout):
        raise gemini.httpx.ConnectError("down")
    monkeypatch.setattr(gemini, "_post", broken)

    async def claude(system, prompt, names, **kw):
        return sdk.Run(text="from claude", model="claude-test")
    monkeypatch.setattr(sdk, "run", claude)
    assert asyncio.run(llm.run("sys", "hi", [])).model == "claude-test"


def test_no_key_skips_gemini(monkeypatch):
    with pytest.raises(sdk.SdkUnavailable, match="GEMINI_API_KEY"):
        asyncio.run(gemini.run("sys", "hi", []))
