import json

import httpx
import pytest

from serpapi import client, market
from serpapi import queries as q

SNAP = json.loads(client.SNAPSHOT.read_text())
REQ = ("google_news", {"q": "Toyota Test recall"})


class Fake:
    """Stands in for httpx.get/post: Supabase rows, SerpApi body, or a network error."""

    def __init__(self, db_rows=None, db_error=False):
        self.db_rows, self.db_error, self.serpapi, self.writes = db_rows or [], db_error, [], []

    def get(self, url, params=None, **kw):
        if url == client.SERPAPI_URL:
            self.serpapi.append(params)
            return httpx.Response(200, json={"news_results": [], "search_metadata": {"x": 1}}, request=httpx.Request("GET", url))
        if self.db_error:
            raise httpx.ConnectError("down")
        return httpx.Response(200, json=self.db_rows, request=httpx.Request("GET", url))

    def post(self, url, json=None, **kw):
        self.writes.append(json)
        return httpx.Response(201, request=httpx.Request("POST", url))


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(client, "_db_down_until", 0.0)
    monkeypatch.setenv("SERPAPI_API_KEY", "test-key")
    monkeypatch.setenv("SUPABASE_URL", "https://db.example.test")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service")

    def use(fake: Fake) -> Fake:
        monkeypatch.setattr(httpx, "get", fake.get)
        monkeypatch.setattr(httpx, "post", fake.post)
        return fake
    return use


def test_supabase_hit_spends_no_quota(env):
    row = {"key": client.cache_key(*REQ), "engine": REQ[0], "params": REQ[1], "response": {"news_results": []},
           "source": "SerpApi Google News", "fetched_at": "2026-10-24T00:00:00+00:00"}
    fake = env(Fake(db_rows=[row]))
    assert client.search(*REQ)["cached"] is True
    assert fake.serpapi == []


def test_miss_calls_live_once_and_writes_cache_without_the_key(env):
    fake = env(Fake())
    row = client.search(*REQ)
    assert row["cached"] is False and client.calls == 1 and len(fake.serpapi) == 1
    assert fake.writes[0]["key"] == client.cache_key(*REQ) and fake.writes[0]["fetched_at"]
    assert "test-key" not in json.dumps(fake.writes) and "search_metadata" not in row["response"]


def test_supabase_down_falls_back_to_snapshot(env, monkeypatch):
    monkeypatch.setattr(client, "_db_down_until", 0.0)
    fake = env(Fake(db_error=True))
    row = client.search(*q.recalls("RAV4"))
    assert row["cached"] is True and fake.serpapi == [] and client._db_down_until > 0   # later lookups skip Supabase


def test_offline_miss_raises_and_budget_caps(env, monkeypatch):
    env(Fake())
    monkeypatch.setenv("NEXTMOVE_OFFLINE", "1")
    with pytest.raises(client.CacheMiss):
        client.search(*REQ)
    monkeypatch.delenv("NEXTMOVE_OFFLINE")
    monkeypatch.setattr(client, "calls", client.MAX_LIVE_CALLS)
    with pytest.raises(client.CacheMiss):
        client.search(*REQ)


def test_cache_key_ignores_param_order():
    assert client.cache_key("google", {"a": 1, "b": 2}) == client.cache_key("google", {"b": 2, "a": 1})


def test_snapshot_has_every_persona_key_and_no_reviewer_names():
    for model, year, region in q.PERSONA_VEHICLES:
        for req in (q.comps(model, year, new=year > 2026), q.recalls(model), q.youtube(model, year), q.dealers(region)):
            assert client.cache_key(*req) in SNAP, req
    for row in SNAP.values():
        if row["engine"] == "google_maps_reviews":
            assert all(set(r) <= {"rating", "snippet", "iso_date"} for r in row["response"]["reviews"])


def test_parsers_on_snapshot():
    get = lambda req: SNAP[client.cache_key(*req)]["response"]
    comps = market.parse_comps(get(q.comps("Camry", 2022)), "Camry", 2022)
    assert len(comps) >= 3 and all(5_000 <= c["price"] <= 150_000 and c["source_url"].startswith("http") for c in comps)
    assert all("Camry" in r["title"] for r in market.parse_recalls(get(q.recalls("Camry")), "Camry"))
    dealers = market.parse_dealers(get(q.dealers("South")), "South")
    assert dealers and all(d["review_count"] >= 100 and d["distance_mi"] < 60 for d in dealers)
    t = market.parse_trend(get(q.trends()), "RAV4")
    assert t["direction"] in {"up", "flat", "down"} and 0 <= t["demand_index"] <= 100


def test_price_extraction():
    resp = {"organic_results": [
        {"title": "Used 2022 Toyota Camry", "link": "a", "snippet": "an average price of $22,985, 33% are good deals"},
        {"title": "2022 Toyota Camry LE", "link": "b", "snippet": "has a current resale value of $18,250 and trade-in"},
        {"title": "2022 Toyota Camry", "link": "c", "snippet": "range from $2,495 to $53,970"},              # range: skipped
        {"title": "2021 Toyota Camry", "link": "d", "snippet": "average price of $21,000"},                 # wrong year
        {"title": "2022 Toyota Camry", "link": "e", "rich_snippet": {"top": {"detected_extensions": {"price": 20800.0}}}},
    ]}
    assert [c["price"] for c in market.parse_comps(resp, "Camry", 2022)] == [22985, 18250, 20800]


def test_engine_comp_lookups_are_one_supabase_query(env):
    reqs = [q.comps(m, y) for m, y in (("RAV4", 2024), ("Camry", 2022), ("Prius", 2023))]
    rows = [{"key": client.cache_key(*r), "engine": r[0], "params": r[1], "response": {"organic_results": []},
             "source": "SerpApi Google Search", "fetched_at": "2026-10-24T00:00:00+00:00"} for r in reqs]
    fake, calls = env(Fake(db_rows=rows)), []
    get = fake.get
    fake.get = lambda url, params=None, **kw: calls.append(params) or get(url, params, **kw)
    env(fake)
    client._db_engine_rows.cache_clear()
    try:
        assert all(client.cached_only(*r)["key"] == row["key"] for r, row in zip(reqs, rows))
        assert len(calls) == 1 and fake.serpapi == []
    finally:
        client._db_engine_rows.cache_clear()
