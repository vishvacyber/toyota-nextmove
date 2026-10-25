"""Voice calls: the customer's mic ↔ Gemini Live (native audio), over the same tool registry as every agent.

Browser socket (/voice/{customer_id}): binary frames are mic PCM16 at 16 kHz in, model audio PCM16 at 24 kHz out;
text frames are JSON: in `{"type": "hangup"}` / `{"type": "customer", "text"}` (speech-to-text after a takeover);
out `{"type": "call", "call"}` on every change, `{"type": "interrupted"}`, `{"type": "identified", "customer_id",
"first_name"}` when the caller is verified, and `{"type": "say", "text"}` only when a rep message couldn't be voiced
(rep messages are normally spoken with Gemini TTS and sent as audio frames).

Accounts: a caller who isn't signed in can say their name (or customer ID) and which Toyota they drive; the
identify_customer tool must match both. Until then account tools are refused; after, every account tool is pinned to
the verified customer ID, so the model can't reach anyone else's account.

Rules: numbers only from tools (rule 1). Speech can't be held back for review, so the Guardian checks each finished
agent turn right away (rule 2 for voice, see DECISIONS): a failed turn is flagged here and in the console, and the
model is told to correct itself out loud. The key stays on the server; only the customer ID reaches the model (rule 6).
"""

import asyncio
import base64
import io
import json
import logging
import os
import time
import wave
from datetime import UTC, datetime

import httpx
import websockets
from fastapi import WebSocket, WebSocketDisconnect

from agents import gemini, guardian, traces
from agents.autonomy import AGENT_TOOLS, gate
from agents.orchestrator import outputs, trace_id
from agents.prompts import PROMPTS, VOICE
from app.models import (
    Action,
    AgentName,
    AgentTrace,
    AutonomyLevel,
    Call,
    CallLine,
    CallRole,
    CallStatus,
    HandoffCreate,
    Status4,
    Surface,
    ToolCall,
    Verdict,
)
from sim.generator import customers_by_id
from tools import ToolError, actions, call, store

log = logging.getLogger("nextmove.live")
URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
TOOLS = list(dict.fromkeys([*AGENT_TOOLS["advisor"], "handoff_to_human", "estimate_payment", "identify_customer"]))
ACCOUNT_TOOLS = {"get_customer", "run_scenario", "check_eligibility", "get_timing", "book_appointment", "handoff_to_human"}
GUEST = "GUEST"   # a caller not signed in: estimates and market data until they're identified
MAX_TRIES = 3     # identify attempts per call
AGENT_VOICE, REP_VOICE = "Aoede", "Charon"   # two natural Gemini voices, so callers can tell the AI from the rep
TTS_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
CALLS: dict[str, Call] = {}
TRIES: dict[str, int] = {}
SOCKETS: dict[str, WebSocket] = {}   # call id → the customer's socket
AI: dict[str, asyncio.Task] = {}     # call id → the Gemini side, cancelled on takeover
connect = websockets.connect         # tests swap in a fake Gemini


def model() -> str:
    return os.environ.get("GEMINI_LIVE_MODEL") or "gemini-3.8-live"   # checked live: tool calls + transcripts, ~2.5 s to first audio


def now() -> datetime:
    return datetime.now(UTC)


def tts_model() -> str:
    return os.environ.get("GEMINI_TTS_MODEL") or "gemini-3.8-flash-tts"   # checked live: ~3.5 s, 24 kHz mono


def voice(name: str) -> dict:
    return {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": name}}}


def setup(customer_id: str, lang: str) -> dict:
    who = ("The caller isn't signed in. For anything about their own lease or loan, first ask their first name (or "
           "customer ID) and which Toyota they drive, then call identify_customer; never discuss an account before it's "
           "verified. Anyone can get new-car prices and a trade-in estimate with estimate_payment."
           if customer_id == GUEST else f"Customer ID: {customer_id} (signed in on the kiosk).")
    return {"setup": {
        "model": f"models/{model()}",
        "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": voice(AGENT_VOICE)},
        "systemInstruction": {"parts": [{"text": f"{PROMPTS['advisor'][1]}\n{VOICE}\n{who}\n"
                                                 f"Speak {'Spanish' if lang == 'es' else 'English'}."}]},
        "tools": [{"functionDeclarations": gemini.declarations(TOOLS)}],
        "inputAudioTranscription": {}, "outputAudioTranscription": {}}}


def say(text: str) -> str:
    return json.dumps({"realtimeInput": {"text": text}})


async def publish(c: Call, console: bool = True) -> None:
    """Captions go to the caller on every chunk; the console gets finished lines (one Realtime POST each)."""
    if ws := SOCKETS.get(c.id):
        try:
            await ws.send_json({"type": "call", "call": c.model_dump(mode="json")})
        except (RuntimeError, WebSocketDisconnect):
            pass
    if console:
        await asyncio.to_thread(traces.broadcast, "calls", "updated", c.model_dump(mode="json"))


def add(c: Call, role: CallRole, text: str, fresh: bool = False) -> CallLine:
    """Append a transcript chunk to the speaker's open line, or start a new line. The caller's words are masked as a
    whole line (rule 6), since a phone number can arrive split over several chunks."""
    last = c.lines[-1] if c.lines else None
    if last and last.role == role and not fresh and last.guardian is None and role in (CallRole.customer, CallRole.agent):
        last.text += text
    else:
        c.lines.append(last := CallLine(role=role, text=text, at=now()))
    if role == CallRole.customer:
        last.text = traces.mask(last.text)
    return last


def handoff(c: Call, reason: str, claimed_by: str | None = None):
    if c.customer_id == GUEST:   # no account to attach a handoff to; the call itself is the record
        return None
    h = actions.handoff_to_human(HandoffCreate(customer_id=c.customer_id, reason=reason, surface=c.surface))
    if claimed_by:
        h = actions.keep("handoffs", h.model_copy(update={"status": Status4.claimed, "claimed_by": claimed_by}))
    traces.broadcast("handoffs", "created", h.model_dump(mode="json"))
    return h


async def ai(c: Call, ws: WebSocket, g, calls: list[ToolCall]) -> None:
    """Gemini → caller: audio out, transcripts into lines, tool calls through the registry, Guardian per turn."""
    async for raw in g:
        m = json.loads(raw)
        if tc := m.get("toolCall"):
            replies = []
            for fc in tc["functionCalls"]:
                name, args, t0 = fc["name"], fc.get("args") or {}, time.monotonic()
                if name not in TOOLS:   # only declared registry tools may run
                    out = {"error": f"Tool {name} is not available"}
                elif name == "identify_customer":
                    out = await identify(c, ws, args)
                    args = {**args, "name": "[masked]"}   # rule 6: the spoken name stays out of traces
                elif name in ACCOUNT_TOOLS and c.customer_id == GUEST:
                    out = {"error": "Not verified yet: ask the caller's first name and which Toyota they drive, then "
                                    "call identify_customer."}
                else:
                    if name in ACCOUNT_TOOLS:   # pinned to the verified caller, whatever ID the model passed
                        args = {**args, "customer_id": c.customer_id}
                    if name == "handoff_to_human":   # the model only says why; code fills who and where
                        args = {"customer_id": c.customer_id, "surface": c.surface.value,
                                "reason": str(args.get("reason") or "Customer asked for a person on a voice call")}
                    try:
                        out = await asyncio.to_thread(call, name, args)
                    except (ToolError, ValueError) as e:
                        out = {"error": str(e)}
                out = out if isinstance(out, dict) else {"result": out}
                if name == "handoff_to_human" and "id" in out:
                    await asyncio.to_thread(traces.broadcast, "handoffs", "created", out)
                calls.append(ToolCall(tool=name, input=args, output=out, duration_ms=round((time.monotonic() - t0) * 1000)))
                replies.append({"id": fc.get("id"), "name": name, "response": out})
            await g.send(json.dumps({"toolResponse": {"functionResponses": replies}}))
            continue
        sc = m.get("serverContent") or {}
        if sc.get("interrupted"):
            await ws.send_json({"type": "interrupted"})
        if t := (sc.get("inputTranscription") or {}).get("text"):
            add(c, CallRole.customer, t)
            await publish(c, console=False)
        for p in (sc.get("modelTurn") or {}).get("parts", []):
            if "inlineData" in p:
                await ws.send_bytes(base64.b64decode(p["inlineData"]["data"]))
        if t := (sc.get("outputTranscription") or {}).get("text"):
            add(c, CallRole.agent, t)
            await publish(c, console=False)
        # Every agent line not yet checked: a turn can be split in two by a line in between ("Caller verified").
        if sc.get("turnComplete") and (unchecked := [x for x in c.lines if x.role == CallRole.agent and x.guardian is None]):
            heard = next((x.text for x in reversed(c.lines) if x.role == CallRole.customer), "")
            failed = []
            for line in unchecked:
                line.guardian, _ = guardian.check(line.text, outputs(calls), heard, spoken=True)
                failed += [ch.detail or ch.name.value for ch in line.guardian.checks if not ch.passed]
            if failed:
                await g.send(say(f"[Guardian] Your last answer failed the compliance check: {'; '.join(failed)}. "
                                 "Briefly correct it; use only numbers your tools returned."))
            await publish(c)


async def identify(c: Call, ws: WebSocket, args: dict) -> dict:
    if c.customer_id != GUEST:
        return {"verified": True, "customer_id": c.customer_id}
    TRIES[c.id] = TRIES.get(c.id, 0) + 1
    if TRIES[c.id] > MAX_TRIES:
        return {"verified": False, "reason": "Too many attempts on this call; offer to bring in a specialist"}
    try:
        out = await asyncio.to_thread(call, "identify_customer", args)
    except (ToolError, ValueError) as e:
        return {"verified": False, "reason": str(e)}
    if out.get("verified"):
        c.customer_id = out["customer_id"]
        add(c, CallRole.system, "Caller verified by name and vehicle.")
        await ws.send_json({"type": "identified", "customer_id": c.customer_id,
                            "first_name": customers_by_id()[c.customer_id].first_name})
        await publish(c)
    return out


async def speak(text: str) -> bytes | None:
    """A rep's typed message as natural speech (Gemini TTS): PCM16 24 kHz like the agent's audio, or None on failure."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(TTS_URL.format(model=tts_model()), headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                                    json={"contents": [{"parts": [{"text": f"Say warmly and naturally: {text}"}]}],
                                          "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": voice(REP_VOICE)}})
            res.raise_for_status()
            part = res.json()["candidates"][0]["content"]["parts"][0]["inlineData"]
        data = base64.b64decode(part["data"])
        if "wav" in part["mimeType"]:
            with wave.open(io.BytesIO(data)) as w:
                data = w.readframes(w.getnframes())
        return data
    except (KeyError, IndexError, ValueError, httpx.HTTPError, wave.Error) as e:
        log.warning("rep voice unavailable: %s", type(e).__name__)
        return None


async def run_ai(c: Call, ws: WebSocket, lang: str, calls: list[ToolCall], upstream: asyncio.Queue) -> None:
    try:
        async with connect(URL, additional_headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, max_size=None,
                           open_timeout=8) as g:
            await g.send(json.dumps(setup(c.customer_id, lang)))
            await asyncio.wait_for(g.recv(), 8)   # setupComplete
            await g.send(say(f"(The customer just connected on the {c.surface.value}. Greet them in one short "
                             "sentence and ask how you can help with their Toyota. Don't call tools yet.)"))

            async def pump():
                while True:
                    await g.send(await upstream.get())
            sender = asyncio.create_task(pump())
            try:
                await ai(c, ws, g, calls)
            finally:
                sender.cancel()
    except asyncio.CancelledError:
        raise
    except (KeyError, OSError, TimeoutError, websockets.WebSocketException, json.JSONDecodeError) as e:
        log.warning("voice agent unavailable for %s: %s", c.id, type(e).__name__)
        if c.status == CallStatus.ai:
            add(c, CallRole.system, "The voice assistant is unavailable right now. A specialist has been notified "
                                    "and will join or call you back.")
            await asyncio.to_thread(handoff, c, "Voice assistant unavailable during a call")
            await publish(c)


async def session(ws: WebSocket, customer_id: str, lang: str, surface: Surface) -> None:
    await ws.accept()
    started, t0 = now(), time.monotonic()
    c = Call(id=actions.new_id("CALL"), customer_id=customer_id, surface=surface, status=CallStatus.ai,
             started_at=started, lines=[])
    CALLS[c.id], SOCKETS[c.id] = c, ws
    calls: list[ToolCall] = []
    upstream: asyncio.Queue = asyncio.Queue(maxsize=200)
    await publish(c)
    AI[c.id] = asyncio.create_task(run_ai(c, ws, lang, calls, upstream))
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if (data := msg.get("bytes")) is not None:
                if c.status == CallStatus.ai and not upstream.full():   # drop audio rather than lag behind
                    upstream.put_nowait(json.dumps({"realtimeInput": {"audio": {
                        "data": base64.b64encode(data).decode(), "mimeType": "audio/pcm;rate=16000"}}}))
                continue
            event = json.loads(msg.get("text") or "{}")
            if event.get("type") == "hangup":
                break
            if event.get("type") == "customer" and (text := str(event.get("text", "")).strip()):
                add(c, CallRole.customer, traces.mask(text)[:500], fresh=True)
                await publish(c)
    except (WebSocketDisconnect, RuntimeError, json.JSONDecodeError):
        pass
    finally:
        AI.pop(c.id).cancel()
        SOCKETS.pop(c.id, None)
        c.status, c.ended_at = CallStatus.ended, now()
        flagged = [x.guardian for x in c.lines if x.guardian and x.guardian.verdict != Verdict.pass_]
        checked = [x.guardian for x in c.lines if x.guardian]
        verdict = (flagged or checked or [guardian.check("", [], spoken=True)[0]])[0]
        t = traces.write(AgentTrace(
            id=trace_id(), agent=AgentName("voice"), customer_id=customer_id, session_id=c.id, started_at=started,
            duration_ms=round((time.monotonic() - t0) * 1000), tool_calls=calls, guardian=verdict, model=model(),
            prompt_version="voice@v1",
            plan=["Live voice call", f"{len(checked)} agent turns Guardian-checked", f"{len(flagged)} flagged"]
                 + ([f"Taken over by {c.taken_by}"] if c.taken_by else []),
            action=Action(type="voice_call", autonomy_level=AutonomyLevel.L1, status=gate(AutonomyLevel.L1))))
        c.trace_id = t.id
        store.save("calls", c.id, c.model_dump(mode="json"))
        await asyncio.to_thread(traces.broadcast, "calls", "updated", c.model_dump(mode="json"))


async def take_over(c: Call, employee: str) -> Call:
    """A rep joins: the AI leaves the call, the caller hears who joined, and a claimed handoff records it."""
    if c.status == CallStatus.ai:
        if task := AI.get(c.id):
            task.cancel()
        c.status, c.taken_by = CallStatus.human, employee
        add(c, CallRole.system, f"{employee} from Toyota Financial Services joined the call.")
        await asyncio.to_thread(handoff, c, "Took over a voice call", employee)
        if ws := SOCKETS.get(c.id):
            await ws.send_json({"type": "interrupted"})
        await publish(c)
    return c


async def rep_says(c: Call, text: str) -> Call:
    """The caption goes out at once; the rep's voice follows a few seconds later (browser voice if TTS fails)."""
    add(c, CallRole.employee, text)
    await publish(c)
    if ws := SOCKETS.get(c.id):
        audio = await speak(text)
        try:
            await (ws.send_bytes(audio) if audio else ws.send_json({"type": "say", "text": text}))
        except (RuntimeError, WebSocketDisconnect):
            pass
    return c


def hydrate() -> None:
    for data in store.load("calls"):
        CALLS.setdefault(data["id"], Call.model_validate(data))
