"""Voice calls against a fake Gemini Live socket: tools, Guardian per turn, takeover, and Gemini being down."""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from agents import live
from app.main import app
from tools import actions
from tools.customer import customer


class FakeGemini:
    """Scripted server messages after setupComplete; then stays open (an active call) until cancelled."""

    def __init__(self, script):
        self.script, self.sent = script, []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def send(self, msg):
        self.sent.append(json.loads(msg))

    async def recv(self):
        return json.dumps({"setupComplete": {}})

    async def __aiter__(self):
        for m in self.script:
            yield json.dumps(m)
        await asyncio.Event().wait()


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    fake = {}

    def use(*script):
        fake["g"] = FakeGemini(script)
        monkeypatch.setattr(live, "connect", lambda *a, **kw: fake["g"])
        return fake["g"]
    return use


def said(text):
    return {"serverContent": {"outputTranscription": {"text": text}}}


DONE = {"serverContent": {"turnComplete": True}}


def until(ws, ok):
    while True:
        m = ws.receive_json()
        if m["type"] == "call" and ok(m["call"]):
            return m["call"]


def checked(call):
    return any(x.get("guardian") for x in call["lines"])


def test_tool_answer_passes_guardian_and_is_traced(gemini):
    pay = customer("CUST-JAMES").contract.monthly_payment
    g = gemini({"toolCall": {"functionCalls": [{"id": "1", "name": "get_customer", "args": {"customer_id": "CUST-JAMES"}}]}},
               said(f"Your payment today is ${pay:,.2f}."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-JAMES") as ws:
        c = until(ws, checked)
        line = c["lines"][-1]
        assert line["role"] == "agent" and line["guardian"]["verdict"] == "pass"
        reply = next(m["toolResponse"] for m in g.sent if "toolResponse" in m)["functionResponses"][0]
        assert reply["name"] == "get_customer" and "contract" in reply["response"]
        assert g.sent[0]["setup"]["model"].startswith("models/") and "CUST-JAMES" in json.dumps(g.sent[0])
        ws.send_json({"type": "hangup"})
    ended = live.CALLS[c["id"]]
    assert ended.status == "ended" and ended.trace_id


def test_invented_number_is_flagged_and_corrected(gemini):
    g = gemini(said("Your new payment would be $123.45 a month."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-JAMES") as ws:
        c = until(ws, checked)
        assert c["lines"][-1]["guardian"]["verdict"] == "block"
        ws.send_json({"type": "hangup"})
    assert any("[Guardian]" in m.get("realtimeInput", {}).get("text", "") for m in g.sent)


def test_undeclared_tool_is_refused(gemini):
    g = gemini({"toolCall": {"functionCalls": [{"id": "1", "name": "log_decision", "args": {}}]}}, said("Okay."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-JAMES") as ws:
        until(ws, checked)
        ws.send_json({"type": "hangup"})
    reply = next(m["toolResponse"] for m in g.sent if "toolResponse" in m)["functionResponses"][0]
    assert reply["response"] == {"error": "Tool log_decision is not available"}


def test_takeover_hands_the_call_to_a_rep(gemini):
    gemini(said("Hi, how can I help?"), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-MARIA") as ws:
        c = until(ws, checked)
        assert api.post(f"/calls/{c['id']}/messages", json={"text": "hi"}).status_code == 409   # AI still on the call
        r = api.post(f"/calls/{c['id']}/takeover", json={"employee": "Alex"})
        assert r.status_code == 200 and r.json()["status"] == "human" and r.json()["taken_by"] == "Alex"
        assert api.post(f"/calls/{c['id']}/takeover", json={"employee": "advisor"}).status_code == 409
        api.post(f"/calls/{c['id']}/messages", json={"text": "I'm reviewing your buyout now."})
        while (m := ws.receive_json())["type"] != "say":
            pass
        assert m["text"] == "I'm reviewing your buyout now."
        ws.send_json({"type": "customer", "text": "Thanks, my email is a@b.com"})
        c = until(ws, lambda c: c["lines"][-1]["role"] == "customer")
        assert c["lines"][-1]["text"] == "Thanks, my email is [email]"   # rule 6: masked
        ws.send_json({"type": "hangup"})
    h = actions.STORE["handoffs"][-1]
    assert h.customer_id == "CUST-MARIA" and h.status == "claimed" and h.claimed_by == "Alex"
    assert api.get("/calls").json()[0]["id"] == c["id"]


def test_gemini_down_tells_the_caller_and_hands_off():
    before = len(actions.STORE["handoffs"])   # no GEMINI_API_KEY in tests
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-PRIYA?lang=es&surface=app") as ws:
        c = until(ws, lambda c: any(x["role"] == "system" for x in c["lines"]))
        assert c["surface"] == "app" and "specialist" in c["lines"][-1]["text"]
        ws.send_json({"type": "hangup"})
    assert len(actions.STORE["handoffs"]) == before + 1 and actions.STORE["handoffs"][-1].status == "waiting"


def test_unknown_customer_is_refused():
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as api, pytest.raises(WebSocketDisconnect), api.websocket_connect("/voice/CUST-NOBODY") as ws:
        ws.receive_json()


def test_guest_call_gets_estimate_tools_only(gemini):
    g = gemini(said("Hi! I can price a new Toyota for you."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/GUEST") as ws:
        c = until(ws, checked)
        r = api.post(f"/calls/{c['id']}/takeover", json={"employee": "Alex"})
        assert r.status_code == 200   # no account, so no handoff record, but a rep can still join
        ws.send_json({"type": "hangup"})
    names = [f["name"] for f in g.sent[0]["setup"]["tools"][0]["functionDeclarations"]]
    assert names == live.GUEST_TOOLS and "Customer ID" not in json.dumps(g.sent[0])
