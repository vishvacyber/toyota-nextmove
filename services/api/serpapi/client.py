"""SerpApi with a cache (CLAUDE.md rule 9).

Lookup order: Supabase `serpapi_cache` → committed snapshot.json → live SerpApi.
Live calls happen only on a miss (or when forced), with SERPAPI_API_KEY set and NEXTMOVE_OFFLINE unset.
"""

import hashlib
import json
import os
import time
from datetime import UTC, datetime
from functools import cache
from pathlib import Path

import httpx

SNAPSHOT = Path(__file__).parent / "snapshot.json"
SERPAPI_URL = "https://serpapi.com/search.json"
TABLE = "serpapi_cache"
calls = 0   # live SerpApi calls made by this process (the seed script prints it)
DB_RETRY_SECONDS = 60   # after a Supabase failure, go straight to the snapshot for this long
_db_down_until = 0.0
MAX_LIVE_CALLS = 10   # per-process guard so a request loop can't drain the quota; the seed raises it


SOURCES = {"google": "SerpApi Google Search", "google_maps": "SerpApi Google Maps", "google_maps_reviews": "SerpApi Google Maps Reviews",
           "google_news": "SerpApi Google News", "google_trends": "SerpApi Google Trends", "youtube": "SerpApi YouTube",
           "youtube_video_transcript": "SerpApi YouTube Transcript"}


class CacheMiss(LookupError):
    pass


def cache_key(engine: str, params: dict) -> str:
    return hashlib.sha256(json.dumps({"engine": engine, **params}, sort_keys=True).encode()).hexdigest()


@cache   # shortcut: read once per process; restart after re-seeding
def _snapshot() -> dict:
    return json.loads(SNAPSHOT.read_text()) if SNAPSHOT.exists() else {}


def _supabase() -> tuple[str, dict] | None:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    return f"{url.rstrip('/')}/rest/v1/{TABLE}", {"apikey": key, "Authorization": f"Bearer {key}"}


def _db_get(key: str) -> dict | None:
    global _db_down_until
    db = _supabase()
    if db is None or time.monotonic() < _db_down_until:
        return None
    try:
        res = httpx.get(db[0], params={"key": f"eq.{key}", "select": "*"}, headers=db[1], timeout=2)
        res.raise_for_status()
        rows = res.json()
        return rows[0] if rows else None
    except (httpx.HTTPError, ValueError):
        _db_down_until = time.monotonic() + DB_RETRY_SECONDS   # Supabase unreachable: use the snapshot
        return None


def db_put(row: dict) -> bool:
    db = _supabase()
    if db is None:
        return False
    try:
        httpx.post(db[0], params={"on_conflict": "key"}, json=row, timeout=5,
                   headers={**db[1], "Prefer": "resolution=merge-duplicates,return=minimal"}).raise_for_status()
        return True
    except httpx.HTTPError:
        return False


def _live(engine: str, params: dict) -> dict:
    global calls
    key = os.environ.get("SERPAPI_API_KEY")
    if not key or os.environ.get("NEXTMOVE_OFFLINE"):
        raise CacheMiss(f"No cached {engine} result and live SerpApi is off")
    if calls >= MAX_LIVE_CALLS:
        raise CacheMiss(f"Live SerpApi budget ({MAX_LIVE_CALLS}) used up in this process")
    calls += 1
    try:
        res = httpx.get(SERPAPI_URL, params={"engine": engine, **params, "api_key": key}, timeout=30)
        res.raise_for_status()
        body = res.json()
    except (httpx.HTTPError, ValueError) as e:
        raise CacheMiss(f"SerpApi {engine} failed: {type(e).__name__}") from None   # never echo the URL (has the key)
    return slim(engine, body)


def _pick(items: list, keys: tuple, n: int) -> list:
    return [{k: x[k] for k in keys if k in x} for x in items[:n]]


def slim(engine: str, body: dict) -> dict:
    """Keep only the fields the parsers read: no request metadata, no reviewer names, short transcripts."""
    if engine == "google":
        return {"organic_results": _pick(body.get("organic_results", []), ("title", "link", "snippet", "rich_snippet"), 20)}
    if engine == "google_maps":
        keys = ("title", "data_id", "place_id", "address", "rating", "reviews", "gps_coordinates", "type")
        return {"local_results": _pick(body.get("local_results", []), keys, 20)}
    if engine == "google_maps_reviews":
        return {"place_info": body.get("place_info", {}), "reviews": _pick(body.get("reviews", []), ("rating", "snippet", "iso_date"), 8)}
    if engine == "google_news":
        news = [{**n, "source": (n.get("source") or {}).get("name")} for n in body.get("news_results", [])]
        return {"news_results": _pick(news, ("title", "link", "iso_date", "source"), 15)}
    if engine == "youtube":
        vids = [{**v, "channel": {"name": (v.get("channel") or {}).get("name")}} for v in body.get("video_results", [])]
        return {"video_results": _pick(vids, ("title", "link", "channel"), 5)}
    if engine == "youtube_video_transcript":
        return {"transcript": _pick(body.get("transcript", []), ("snippet",), 15)}
    if engine == "google_trends":
        return {"interest_over_time": body.get("interest_over_time", {})}
    return body


def search(engine: str, params: dict, force: bool = False) -> dict:
    """Cached row: {key, engine, params, response, source, fetched_at, cached}. Raises CacheMiss offline."""
    key = cache_key(engine, params)
    if not force:
        row = _db_get(key) or _snapshot().get(key)
        if row:
            return {**row, "cached": True}
    row = {"key": key, "engine": engine, "params": params, "response": _live(engine, params),
           "source": SOURCES.get(engine, f"SerpApi {engine}"), "fetched_at": datetime.now(UTC).isoformat()}
    db_put(row)
    return {**row, "cached": False}


@cache   # shortcut: one query per process for every cached row of an engine; restart after re-seeding
def _db_engine_rows(engine: str) -> dict:
    db = _supabase()
    if db is None:
        return {}
    try:
        res = httpx.get(db[0], params={"engine": f"eq.{engine}", "select": "*"}, headers=db[1], timeout=5)
        res.raise_for_status()
        return {r["key"]: r for r in res.json()}
    except (httpx.HTTPError, ValueError):
        return {}   # Supabase unreachable: the snapshot answers


def cached_only(engine: str, params: dict) -> dict | None:
    """Cache lookup that never spends quota (used on hot paths like the engine): one Supabase query per engine,
    then the committed snapshot."""
    key = cache_key(engine, params)
    return _db_engine_rows(engine).get(key) or _snapshot().get(key)
