"""AgentTrace store: Supabase `traces` table + Realtime Broadcast on channel `traces` (event `created`).

Memory keeps every trace this process wrote, so GET /traces still works when Supabase is down or not configured.
"""

import logging
import re

import httpx

from app.models import AgentTrace
from tools.store import supabase

log = logging.getLogger("nextmove.traces")
MEMORY: list[AgentTrace] = []
PII = [(re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[email]"),
       (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[ssn]"),
       (re.compile(r"\b(?:\d[ -]?){13,16}\b"), "[card]"),
       (re.compile(r"(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b"), "[phone]")]


def mask(text: str) -> str:
    """Rule 6: strip emails, SSNs, card and phone numbers (from the customer's message, before the LLM and logs)."""
    for pattern, repl in PII:
        text = pattern.sub(repl, text)
    return text


_supabase = supabase


def broadcast(channel: str, event: str, payload: dict) -> bool:
    """Server-side Realtime Broadcast over REST (same channels the console and customer app subscribe to)."""
    db = _supabase()
    if db is None:
        return False
    try:
        httpx.post(f"{db[0]}/realtime/v1/api/broadcast", headers=db[1], timeout=3,
                   json={"messages": [{"topic": channel, "event": event, "payload": payload}]}).raise_for_status()
        return True
    except httpx.HTTPError as e:
        log.warning("broadcast %s/%s failed: %s", channel, event, type(e).__name__)
        return False


def write(trace: AgentTrace) -> AgentTrace:
    MEMORY.append(trace)
    data = trace.model_dump(mode="json")
    log.info("trace %s agent=%s customer=%s verdict=%s action=%s", trace.id, trace.agent.root, trace.customer_id,
             trace.guardian.verdict.value, trace.action.status.value)
    db = _supabase()
    if db is not None:
        try:
            httpx.post(f"{db[0]}/rest/v1/traces", timeout=3, headers={**db[1], "Prefer": "return=minimal"},
                       json={"id": trace.id, "agent": trace.agent.root, "customer_id": trace.customer_id,
                             "started_at": data["started_at"], "trace": data}).raise_for_status()
        except httpx.HTTPError as e:
            log.warning("trace %s not saved to Supabase: %s", trace.id, type(e).__name__)
    broadcast("traces", "created", data)
    return trace


def list_traces(customer_id: str | None = None, limit: int = 100) -> list[AgentTrace]:
    db = _supabase()
    if db is not None:
        params = {"select": "trace", "order": "started_at.desc", "limit": str(limit)}
        if customer_id:
            params["customer_id"] = f"eq.{customer_id}"
        try:
            res = httpx.get(f"{db[0]}/rest/v1/traces", params=params, headers=db[1], timeout=3)
            res.raise_for_status()
            return [AgentTrace.model_validate(r["trace"]) for r in res.json()]
        except (httpx.HTTPError, ValueError) as e:
            log.warning("traces read from memory: %s", type(e).__name__)
    rows = [t for t in MEMORY if customer_id in (None, t.customer_id)]
    return sorted(rows, key=lambda t: t.started_at, reverse=True)[:limit]
