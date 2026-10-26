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


async def no_voice(text):
    return None


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setattr(live, "speak", no_voice)   # never reach Gemini TTS from a test
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
    pay = customer("CUST-SAMEERA2026").contract.monthly_payment
    g = gemini({"toolCall": {"functionCalls": [{"id": "1", "name": "get_customer", "args": {"customer_id": "CUST-SAMEERA2026"}}]}},
               said(f"Your payment today is ${pay:,.2f}."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-SAMEERA2026") as ws:
        c = until(ws, checked)
        line = c["lines"][-1]
        assert line["role"] == "agent" and line["guardian"]["verdict"] == "pass"
        reply = next(m["toolResponse"] for m in g.sent if "toolResponse" in m)["functionResponses"][0]
        assert reply["name"] == "get_customer" and "contract" in reply["response"]
        assert g.sent[0]["setup"]["model"].startswith("models/") and "CUST-SAMEERA2026" in json.dumps(g.sent[0])
        ws.send_json({"type": "hangup"})
    ended = live.CALLS[c["id"]]
    assert ended.status == "ended" and ended.trace_id


def test_invented_number_is_flagged_and_corrected(gemini):
    g = gemini(said("Your new payment would be $123.45 a month."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-SAMEERA2026") as ws:
        c = until(ws, checked)
        assert c["lines"][-1]["guardian"]["verdict"] == "block"
        ws.send_json({"type": "hangup"})
    assert any("[Guardian]" in m.get("realtimeInput", {}).get("text", "") for m in g.sent)


def test_undeclared_tool_is_refused(gemini):
    g = gemini({"toolCall": {"functionCalls": [{"id": "1", "name": "log_decision", "args": {}}]}}, said("Okay."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-SAMEERA2026") as ws:
        until(ws, checked)
        ws.send_json({"type": "hangup"})
    reply = next(m["toolResponse"] for m in g.sent if "toolResponse" in m)["functionResponses"][0]
    assert reply["response"] == {"error": "Tool log_decision is not available"}


def test_takeover_hands_the_call_to_a_rep(gemini):
    gemini(said("Hi, how can I help?"), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-VISHWAA2026") as ws:
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
    assert h.customer_id == "CUST-VISHWAA2026" and h.status == "claimed" and h.claimed_by == "Alex"
    assert api.get("/calls").json()[0]["id"] == c["id"]


def test_gemini_down_tells_the_caller_and_hands_off():
    before = len(actions.STORE["handoffs"])   # no GEMINI_API_KEY in tests
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-HUNG2026?lang=es&surface=app") as ws:
        c = until(ws, lambda c: any(x["role"] == "system" for x in c["lines"]))
        assert c["surface"] == "app" and "specialist" in c["lines"][-1]["text"]
        ws.send_json({"type": "hangup"})
    assert len(actions.STORE["handoffs"]) == before + 1 and actions.STORE["handoffs"][-1].status == "waiting"


def test_unknown_customer_is_refused():
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as api, pytest.raises(WebSocketDisconnect), api.websocket_connect("/voice/CUST-NOBODY") as ws:
        ws.receive_json()


def ident(name, car, i="9"):
    return {"toolCall": {"functionCalls": [{"id": i, "name": "identify_customer", "args": {"name": name, "vehicle_model": car}}]}}


def replies(g):
    return [r for m in g.sent if "toolResponse" in m for r in m["toolResponse"]["functionResponses"]]


def test_caller_is_identified_by_name_and_car_then_pinned_to_that_account(gemini):
    g = gemini({"toolCall": {"functionCalls": [{"id": "1", "name": "get_customer", "args": {"customer_id": "CUST-VISHWAA2026"}}]}},
               ident("Vishwaa", "Camry", "2"), ident("vishwaa", "RAV4 hybrid", "3"),
               {"toolCall": {"functionCalls": [{"id": "4", "name": "get_customer", "args": {"customer_id": "CUST-SAMEERA2026"}}]}},
               said("Thanks, I found your account."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/GUEST") as ws:
        while (m := ws.receive_json())["type"] != "identified":
            pass
        assert m == {"type": "identified", "customer_id": "CUST-VISHWAA2026", "first_name": "Vishwaa"}
        c = until(ws, checked)
        assert c["customer_id"] == "CUST-VISHWAA2026"
        ws.send_json({"type": "hangup"})
    r = replies(g)
    assert "Not verified" in r[0]["response"]["error"]                    # no account data before verification
    assert r[1]["response"]["verified"] is False                           # right name, wrong car
    assert r[2]["response"] == {"verified": True, "customer_id": "CUST-VISHWAA2026"}
    assert r[3]["response"]["id"] == "CUST-VISHWAA2026"                    # asked for someone else: pinned to the caller
    traced = live.CALLS[c["id"]]
    assert traced.status == "ended"
    assert "Vishwaa" not in json.dumps([m for m in g.sent if "toolResponse" in m])


def test_identify_locks_after_three_tries(gemini):
    g = gemini(*[ident("Vishwaa", "Tacoma", str(i)) for i in range(4)], said("Let me get a specialist."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/GUEST") as ws:
        until(ws, checked)
        ws.send_json({"type": "hangup"})
    assert "Too many attempts" in replies(g)[3]["response"]["reason"]


def test_rep_message_is_spoken_with_a_natural_voice(gemini, monkeypatch):
    async def voiced(text):
        return b"\x01\x00" * 2400
    gemini(said("Hi, how can I help?"), DONE)
    monkeypatch.setattr(live, "speak", voiced)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-SAMEERA2026") as ws:
        c = until(ws, checked)
        api.post(f"/calls/{c['id']}/takeover", json={"employee": "Alex"})
        api.post(f"/calls/{c['id']}/messages", json={"text": "Hi, I'm Alex."})
        while (m := ws.receive())["type"] == "websocket.send" and m.get("bytes") is None:
            pass
        assert m["bytes"] == b"\x01\x00" * 2400
        ws.send_json({"type": "hangup"})


def test_guest_setup_declares_identify_and_hides_the_name(gemini):
    g = gemini(said("Hi! I can price a new Toyota for you."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/GUEST") as ws:
        c = until(ws, checked)
        assert api.post(f"/calls/{c['id']}/takeover", json={"employee": "Alex"}).status_code == 200   # a rep can still join
        ws.send_json({"type": "hangup"})
    setup = g.sent[0]["setup"]
    names = [f["name"] for f in setup["tools"][0]["functionDeclarations"]]
    assert "identify_customer" in names and "estimate_payment" in names and "Customer ID" not in json.dumps(setup)
    assert setup["generationConfig"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] == live.AGENT_VOICE


def test_voice_socket_refuses_other_websites():
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app) as api, pytest.raises(WebSocketDisconnect) as e, \
            api.websocket_connect("/voice/CUST-HUNG2026", headers={"origin": "https://evil.example"}) as ws:
        ws.receive_json()
    assert e.value.code == 4403


def test_guardian_checks_speech_split_by_verification(gemini):
    g = gemini(said("Your lease payment is $123.45. "), ident("Vishwa", "RAV4"), said("Thanks, you're verified."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/GUEST", headers={"origin": "http://localhost:3000"}) as ws:
        c = until(ws, lambda c: sum(1 for x in c["lines"] if x.get("guardian")) == 2)
        ws.send_json({"type": "hangup"})
    first = next(x for x in c["lines"] if x["role"] == "agent")
    assert "$123.45" in first["text"] and first["guardian"]["verdict"] == "block"   # checked even though it isn't last
    assert any("[Guardian]" in m.get("realtimeInput", {}).get("text", "") for m in g.sent)


def test_spoken_phone_number_is_masked_even_when_split(gemini):
    heard = [{"serverContent": {"inputTranscription": {"text": t}}} for t in ("Call me at 555-123", "-4567 please")]
    gemini(*heard, said("Sure."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-HUNG2026") as ws:
        c = until(ws, checked)
        ws.send_json({"type": "hangup"})
    caller = next(x for x in c["lines"] if x["role"] == "customer")
    assert "4567" not in caller["text"] and "[phone]" in caller["text"]


def test_rep_voice_falls_back_to_the_next_tts_model(monkeypatch):
    import base64 as b64

    import httpx
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setenv("GEMINI_TTS_MODEL", "first, second")
    tried = []

    async def post(self, url, **kw):
        tried.append(url.split("/models/")[1].split(":")[0])
        if len(tried) == 1:
            return httpx.Response(429, request=httpx.Request("POST", url))
        return httpx.Response(200, request=httpx.Request("POST", url), json={"candidates": [{"content": {"parts": [
            {"inlineData": {"mimeType": "audio/l16; rate=24000", "data": b64.b64encode(b"\x01\x00").decode()}}]}}]})
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    assert asyncio.run(live.speak("Hi")) == b"\x01\x00" and tried == ["first", "second"]


def test_hosted_sites_may_call_but_lookalikes_may_not(gemini):
    from starlette.websockets import WebSocketDisconnect

    from app.main import ALLOWED_ORIGIN
    assert all(ALLOWED_ORIGIN.fullmatch(o) for o in ["https://toyotanxt.tech", "https://app.toyotanxt.tech",
                                                       "https://console.toyotanxt.tech", "http://localhost:3000"])
    assert not any(ALLOWED_ORIGIN.fullmatch(o) for o in ["https://toyotanxt.tech.evil.example", "http://toyotanxt.tech",
                                                         "https://evil-toyotanxt.tech"])
    gemini(said("Hi."), DONE)
    with TestClient(app) as api, api.websocket_connect("/voice/CUST-HUNG2026", headers={"origin": "https://toyotanxt.tech"}) as ws:
        until(ws, checked)
        ws.send_json({"type": "hangup"})
    with TestClient(app) as api, pytest.raises(WebSocketDisconnect), \
            api.websocket_connect("/voice/CUST-HUNG2026", headers={"origin": "https://toyotanxt.tech.evil.example"}) as ws:
        ws.receive_json()
    r = TestClient(app).options("/customers", headers={"Origin": "https://app.toyotanxt.tech", "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "https://app.toyotanxt.tech"
