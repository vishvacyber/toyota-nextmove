import httpx
import pytest

from serpapi import client


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """No test ever reaches SerpApi or Supabase: keys cleared, HTTP layer blocked. Tests run on snapshot.json."""
    for k in ("SERPAPI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY", "NEXTMOVE_OFFLINE"):
        monkeypatch.delenv(k, raising=False)

    def blocked(*a, **kw):
        raise AssertionError("network call in a test")

    monkeypatch.setattr(httpx, "get", blocked)
    monkeypatch.setattr(httpx, "post", blocked)
    monkeypatch.setattr(client, "calls", 0)
