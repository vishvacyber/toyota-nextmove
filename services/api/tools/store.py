"""Durable demo state in Supabase: one table, `app_store` (kind, id, data jsonb) — migrations/003_app_store.sql.

Memory stays the read path. Every write goes through `save`, and `load` refills memory when the API starts, so
handoffs, deal packets, offers, Studio agents, audit entries and AI explanations survive restarts. Without Supabase
configured the app still runs, in memory only.
"""

import logging
import os

import httpx

log = logging.getLogger("nextmove.store")
TABLE = "app_store"


def supabase() -> tuple[str, dict] | None:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    return (url.rstrip("/"), {"apikey": key, "Authorization": f"Bearer {key}"}) if url and key else None


def save(kind: str, id: str, data: dict) -> bool:
    db = supabase()
    if db is None:
        return False
    try:
        httpx.post(f"{db[0]}/rest/v1/{TABLE}", params={"on_conflict": "kind,id"}, timeout=3,
                   headers={**db[1], "Prefer": "resolution=merge-duplicates,return=minimal"},
                   json={"kind": kind, "id": id, "data": data}).raise_for_status()
        return True
    except httpx.HTTPError as e:
        log.warning("%s %s not saved to Supabase: %s", kind, id, type(e).__name__)
        return False


# The demo accounts were renamed (Maria/James/Priya → Vishwaa/Sameera/Hung). Rows saved under the old ids stay in
# Supabase untouched but are never loaded, so nothing on screen links to a customer that no longer exists.
RETIRED = {"CUST-MARIA", "CUST-JAMES", "CUST-PRIYA"}


def current(data: dict) -> bool:
    return data.get("customer_id") not in RETIRED


def load(kind: str) -> list[dict]:
    """Rows of one kind, oldest first. Empty when Supabase is unavailable or the table doesn't exist yet."""
    db = supabase()
    if db is None:
        return []
    try:
        res = httpx.get(f"{db[0]}/rest/v1/{TABLE}", headers=db[1], timeout=5,
                        params={"kind": f"eq.{kind}", "select": "data", "order": "updated_at.asc", "limit": "10000"})
        res.raise_for_status()
        return [r["data"] for r in res.json() if current(r["data"])]
    except (httpx.HTTPError, ValueError) as e:
        log.warning("%s not loaded from Supabase: %s", kind, type(e).__name__)
        return []
