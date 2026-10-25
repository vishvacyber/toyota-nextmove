import asyncio

import pytest
from fastapi.testclient import TestClient
from mcp import Client

from app import models
from app.main import app
from engine import scenarios
from engine.scenarios import CFG
from serpapi import client
from sim.generator import customers_by_id
from tools import REGISTRY, ToolError, actions, call
from tools.mcp_server import server

SPEC_TOOLS = {"get_customer", "run_scenario", "check_eligibility", "get_market_value", "find_dealer", "get_recalls",
              "book_appointment", "create_offer_draft", "handoff_to_human", "log_decision", "inspect_photos", "get_timing"}


def test_registry_has_the_12_spec_tools_with_schemas():
    assert set(REGISTRY) == SPEC_TOOLS
    for t in REGISTRY.values():
        assert t.schema["type"] == "object" and t.description


def test_get_customer_masks_pii():
    out = call("get_customer", {"customer_id": "CUST-MARIA"})
    assert out["first_name"] == "[masked]" and out["email"] is None and out["phone"] is None
    assert "Maria" not in str(out) and "Alvarez" not in str(out)
    assert out["contract"]["residual_value"] == 22450


def test_unknown_customer_is_a_tool_error():
    with pytest.raises(ToolError):
        call("get_customer", {"customer_id": "CUST-NOPE"})


def test_run_scenario_matches_engine():
    out = models.ScenarioSet.model_validate(call("run_scenario", {"customer_id": "CUST-JAMES", "options": ["upgrade"]}))
    c = customers_by_id()["CUST-JAMES"]
    assert out.scenarios[0].equity == scenarios.equity(c)


def test_check_eligibility():
    assert call("check_eligibility", {"customer_id": "CUST-PRIYA", "option": "due_date_change"})["eligible"] is True
    out = call("check_eligibility", {"customer_id": "CUST-MARIA", "option": "refinance"})
    assert out["eligible"] is False and out["reason"]


@pytest.mark.parametrize("model", ["RAV4", "Camry", "Prius", "Tacoma", "Highlander", "bZ"])
def test_get_market_value_offline_from_snapshot(model):
    q = models.MarketQuote.model_validate(call("get_market_value", {"model": model}))
    assert q.cached and q.as_of and q.low <= q.estimated_value <= q.high and q.reviews_summary
    # the value's source leads: SerpApi comps when there are enough, else the depreciation table
    table = len(q.comps) < CFG["market"]["min_comps"]
    assert q.source.startswith(CFG["market"]["source"] if table else "SerpApi Google Search")
    if model in ("RAV4", "Camry", "Prius"):   # persona models also have cached dealers
        assert q.dealers and q.trend and len(q.comps) >= 2
    assert client.calls == 0


def test_market_without_cache_falls_back_to_table_with_source():
    q = models.MarketQuote.model_validate(call("get_market_value", {"model": "Tacoma", "year": 2020}))
    assert q.comps == [] and q.low < q.estimated_value < q.high and q.as_of


def test_camry_hybrid_target_is_seeded():
    q = models.MarketQuote.model_validate(call("get_market_value", {"model": "Camry", "year": 2027}))
    assert len(q.comps) >= 2 and q.cached


def test_find_dealer_and_recalls():
    out = call("find_dealer", {"region": "Midwest"})
    assert [models.Dealer.model_validate(d) for d in out["dealers"]] and out["source"] and out["as_of"]
    rec = call("get_recalls", {"model": "Prius"})
    assert all("Prius" in models.Recall.model_validate(r).title for r in rec["recalls"]) and rec["as_of"]
    with pytest.raises(ToolError):
        call("find_dealer", {"region": "Northeast"})   # not seeded, and offline


def test_action_tools_respect_autonomy():
    appt = call("book_appointment", {"customer_id": "CUST-MARIA", "dealer_id": "DLR-01", "at": "2026-11-02T15:00:00Z",
                                     "purpose": "Lease-end inspection"})
    assert appt["status"] == "pending_approval" and REGISTRY["book_appointment"].autonomy == "L3"
    offer = models.Offer.model_validate(call("create_offer_draft", {"name": "Loyalty", "rule": "lease_end",
                                                                    "incentive": {"type": "cash", "value": 500}}))
    assert offer.status == "draft"
    h = models.Handoff.model_validate(call("handoff_to_human", {"customer_id": "CUST-PRIYA", "reason": "Hardship",
                                                                "surface": "app"}))
    assert h.status == "waiting"
    a = models.AuditEntry.model_validate(call("log_decision", {"actor": "advisor", "action": "recommend_buyout",
                                                              "autonomy_level": "L1", "customer_id": "CUST-MARIA"}))
    assert actions.STORE["audit"][-1].id == a.id


def test_inspect_photos_without_photos_is_the_standard_estimate(monkeypatch):
    monkeypatch.setitem(actions.STORE, "inspections", [])
    r = models.InspectionResult.model_validate(call("inspect_photos", {"customer_id": "CUST-MARIA"}))
    assert r.is_estimate and r.items == [] and r.total_estimated_charge == scenarios.CFG["fees"]["wear_estimate"]
    assert "No photo pre-inspection yet" in r.disclaimer


@pytest.mark.parametrize("cid", ["CUST-MARIA", "CUST-JAMES", "CUST-PRIYA"])
def test_get_timing_shape(cid):
    t = models.TimingPlan.model_validate(call("get_timing", {"customer_id": cid}))
    assert t.months[0].month_offset == 0 and 0 <= t.best_month_offset < len(t.months)
    assert t.act_now_vs_wait_3 == pytest.approx(t.months[0].net_position - t.months[min(3, len(t.months) - 1)].net_position)


def test_personas_still_tell_their_story_with_comps():
    c = customers_by_id()
    maria, james = c["CUST-MARIA"], c["CUST-JAMES"]
    assert scenarios.comp_value("RAV4", 2024) and scenarios.comp_value("Camry", 2022)   # values come from comps
    assert scenarios.equity(maria) > 0 and scenarios.equity(james) > 5000
    assert "SerpApi" in scenarios.market_note(maria.vehicle) and "as of" in scenarios.market_note(maria.vehicle)


def test_mcp_server_lists_and_calls_tools():
    async def run():
        async with Client(server) as mcp:
            tools = (await mcp.list_tools()).tools
            ok = await mcp.call_tool("run_scenario", {"customer_id": "CUST-MARIA", "options": ["buyout"]})
            bad = await mcp.call_tool("get_customer", {"customer_id": "CUST-NOPE"})
            return tools, ok, bad
    tools, ok, bad = asyncio.run(run())
    assert {t.name for t in tools} == SPEC_TOOLS
    assert not ok.is_error and ok.structured_content["scenarios"][0]["option"] == "buyout"
    assert bad.is_error


@pytest.mark.parametrize("model", ["RAV4", "Camry", "Prius"])
def test_market_endpoint(model):
    res = TestClient(app).get(f"/market/{model}")
    assert res.status_code == 200
    body = res.json()
    assert body["source"] and body["as_of"] and body["cached"] is True
    assert TestClient(app).get("/market/Corolla").status_code == 422


def test_new_id_is_unique_across_restarts():
    # A per-process counter restarted at 0001 and collided with traces already in Supabase.
    assert len({actions.new_id("TR") for _ in range(1000)}) == 1000
