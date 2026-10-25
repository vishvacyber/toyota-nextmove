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


@pytest.fixture(autouse=True)
def no_live_sdk(monkeypatch):
    """pytest never spends the subscription: the SDK's query() fails loudly; tests fake agents.sdk.run instead."""
    from agents import sdk

    def blocked(*a, **kw):
        raise AssertionError("live SDK call in a test")

    monkeypatch.setattr(sdk, "query", blocked)
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", "/nonexistent-test-login")
