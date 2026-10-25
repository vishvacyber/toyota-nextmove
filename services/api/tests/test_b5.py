import time

import pytest
from fastapi.testclient import TestClient

from agents import sdk, sentinel
from app.main import app
from sim import simulate

api = TestClient(app)
RECALL = {"name": "Recall Notifier", "template": "recall_notifier",
          "tools": ["get_customer", "get_recalls", "find_dealer", "book_appointment", "log_decision"]}


def kpis(**q):
    r = api.get("/kpis", params=q)
    assert r.status_code == 200, r.text
    return r.json()


# ---- Simulation + GET /kpis ----

def test_kpis_full_snapshot_and_deterministic():
    k = kpis()
    assert k == kpis()
    assert k["customers_simulated"] == 1200 and k["months"] == 24 and len(k["series"]) == 24
    assert k["assumptions"] == {"adoption_rate": 0.6, "outreach_lead_days": 90, "hardship_uptake": 0.5}
    assert k["nextmove"]["retention_rate"] > k["baseline"]["retention_rate"]
    assert k["nextmove"]["delinquency_rate"] < k["baseline"]["delinquency_rate"]
    assert k["nextmove"]["calls_per_100_customers"] < k["baseline"]["calls_per_100_customers"]
    assert k["series"][-1]["nextmove_retention"] == k["nextmove"]["retention_rate"]
    rows = simulate.rows()
    assert k["maturity_pipeline"]["d90"] == sum(r.lease and 0 <= r.days_to_maturity <= 90 for r in rows) >= 1


@pytest.mark.parametrize("slider,low,high,metric,direction", [
    ("adoption_rate", 0.2, 0.9, "retention_rate", 1),
    ("outreach_lead_days", 30, 180, "retention_rate", 1),
    ("hardship_uptake", 0.1, 1.0, "delinquency_rate", -1),
])
def test_each_slider_moves_nextmove_not_baseline(slider, low, high, metric, direction):
    lo, hi = kpis(**{slider: low}), kpis(**{slider: high})
    assert lo["baseline"] == hi["baseline"]
    assert (hi["nextmove"][metric] - lo["nextmove"][metric]) * direction > 0


def test_no_adoption_and_no_hardship_uptake_is_baseline():
    k = kpis(adoption_rate=0, hardship_uptake=0)
    assert k["nextmove"]["retention_rate"] == k["baseline"]["retention_rate"]
    assert k["nextmove"]["delinquency_rate"] == k["baseline"]["delinquency_rate"]
    assert all(s["nextmove_retention"] == s["baseline_retention"] for s in k["series"])


def test_kpis_rejects_out_of_range_and_is_fast():
    assert api.get("/kpis", params={"adoption_rate": 1.5}).status_code == 422
    kpis()
    t0 = time.perf_counter()
    for i in range(10):
        kpis(adoption_rate=i / 10)
    assert (time.perf_counter() - t0) / 10 < 0.1


# ---- Fairness ----

def test_fairness_groups_only_region_and_credit_tier():
    f = api.get("/fairness").json()
    assert {g["dimension"] for g in f["groups"]} == {"region", "credit_tier"} and len(f["groups"]) == 8
    for dim in ("region", "credit_tier"):
        assert sum(g["customers"] for g in f["groups"] if g["dimension"] == dim) == 1200
    for dim in ("region", "credit_tier"):
        gs = [g for g in f["groups"] if g["dimension"] == dim]
        n = sum(g["customers"] for g in gs)
        overall = [sum(g[k] * g["customers"] for g in gs) / n for k in ("recommendation_rate", "offer_rate")]
        for g in gs:   # rates are rounded to 3 places, so stay clear of the boundary
            gap = max(abs(g["recommendation_rate"] - overall[0]), abs(g["offer_rate"] - overall[1]))
            if abs(gap - f["threshold"]) > 0.002:
                assert g["flagged"] == (gap > f["threshold"])


# ---- Offers + A/B ----

def test_offer_ab_simulation():
    offers = api.get("/offers").json()
    parent = next(o for o in offers if o["id"] == "OFR-LEASE-RATE")
    r = api.post("/offers", json={"name": "Lease-end loyalty: $1,500 cash", "rule": parent["rule"],
                                  "target_situation": "lease_end", "incentive": {"type": "cash", "value": 1500},
                                  "variant_of": parent["id"]})
    assert r.status_code == 201 and r.json()["status"] == "draft"
    sim = api.post(f"/offers/{parent['id']}/simulate").json()
    assert sim["customers_targeted"] == sum(x.situation.value == "lease_end" for x in simulate.rows())
    by = {v["name"]: v for v in sim["variants"]}
    assert len(by) == 3
    assert by["Lease-end loyalty: $1,500 cash"]["acceptance_rate"] > by["Lease-end loyalty: $500 cash"]["acceptance_rate"]
    assert sim == api.post(f"/offers/{parent['id']}/simulate").json()


def test_offer_404s():
    assert api.post("/offers/OFR-NOPE/simulate").status_code == 404
    bad = {"name": "x", "rule": "x", "incentive": {"type": "cash", "value": 1}, "variant_of": "OFR-NOPE"}
    assert api.post("/offers", json=bad).status_code == 404


# ---- Agent Studio deploy gate ----

@pytest.fixture
def no_sdk(monkeypatch):
    async def never(*a, **kw):
        raise AssertionError("deploy gate called the SDK")
    monkeypatch.setattr(sdk, "run", never)


def test_recall_notifier_deploys_through_gate(no_sdk):
    a = api.post("/studio/agents", json=RECALL)
    assert a.status_code == 201 and a.json()["status"] == "draft"
    t0 = time.perf_counter()
    r = api.post(f"/studio/agents/{a.json()['id']}/deploy").json()
    assert time.perf_counter() - t0 < 5
    assert r["passed"] and r["deployed_at"], r
    assert len(r["eval_results"]) == 4 and len(r["injection_tests"]) >= 5
    listed = next(x for x in api.get("/studio/agents").json() if x["id"] == r["agent_id"])
    assert listed["status"] == "deployed"
    assert any(e["action"] == f"deploy_gate passed {r['agent_id']}" for e in api.get("/audit").json())


@pytest.mark.parametrize("tools", [[], ["get_customer", "wire_money"]])
def test_failing_gate_stays_undeployed(no_sdk, tools):
    a = api.post("/studio/agents", json={"name": "Bad", "template": "custom", "tools": tools}).json()
    r = api.post(f"/studio/agents/{a['id']}/deploy").json()
    assert r["passed"] is False and r["deployed_at"] is None
    assert not r["eval_results"][0]["passed"]
    assert next(x for x in api.get("/studio/agents").json() if x["id"] == a["id"])["status"] == "failed"


def test_deploy_unknown_agent_404():
    assert api.post("/studio/agents/AG-NOPE/deploy").status_code == 404


# ---- Audit ----

def test_audit_has_trace_and_tool_entries():
    tr = sentinel.run()
    alert = next(a for a in sentinel.ALERTS.values() if a.trace_id == tr.id)
    assert api.patch(f"/alerts/{alert.id}", json={"status": "approved", "actor": "EMP-ADVISOR-1"}).status_code == 200
    audit = api.get("/audit").json()
    assert any(e["trace_id"] == tr.id and e["actor"] == "sentinel" for e in audit)
    assert any(e["actor"] == "EMP-ADVISOR-1" and e["action"] == f"alert_approved {alert.id}" for e in audit)
    assert [e["at"] for e in audit] == sorted((e["at"] for e in audit), reverse=True)


# ---- Offer rules ----

def test_offer_rule_narrows_targeting():
    gas = api.post("/offers/OFR-HYBRID/simulate").json()["customers_targeted"]
    rows = simulate.rows()
    assert gas == sum(r.situation.value == "positive_equity" and r.facts["powertrain"] == "gas" for r in rows)
    assert 0 < gas < sum(r.situation.value == "positive_equity" for r in rows)
    sameera = next(r for r in rows if r.id == "CUST-SAMEERA2026")
    assert all(simulate.scenarios.OPS[op](sameera.facts[f], v) for f, op, v in simulate.parse_rule("positive_equity AND powertrain = gas"))
    assert simulate.parse_rule("equity >= $10,000 AND payment_stress = false") == \
        (("equity", "gte", 10000.0), ("payment_stress", "eq", False))


@pytest.mark.parametrize("rule,why", [("region = South", "Unknown rule field"), ("credit_tier = A", "Unknown rule field"),
                                      ("lease_end OR rate_drop", "AND only"), ("powertrain < gas", "compares text"),
                                      ("whatever", "Can't read")])
def test_offer_rule_rejected(rule, why):
    r = api.post("/offers", json={"name": "x", "rule": rule, "incentive": {"type": "cash", "value": 1}})
    assert r.status_code == 422 and why in r.json()["detail"]


# ---- Studio health window + opt-in live gate ----

def test_health_counts_only_last_24h():
    from datetime import timedelta

    from agents import traces
    old = sentinel.run()
    traces.MEMORY[-1] = old.model_copy(update={"started_at": old.started_at - timedelta(hours=25)})
    fresh = sentinel.run()
    h = next(a for a in api.get("/studio/agents").json() if a["id"] == "AG-sentinel")["health"]
    assert h["runs_24h"] == sum(t.agent.root == "sentinel" and t.started_at >= fresh.started_at - timedelta(hours=24)
                                for t in traces.MEMORY)
    assert h["runs_24h"] < sum(t.agent.root == "sentinel" for t in traces.MEMORY)


def test_live_gate_is_opt_in(monkeypatch):
    from tests.test_agents import engine_text, fake_run
    monkeypatch.setenv("STUDIO_GATE_LIVE", "1")
    monkeypatch.setattr(sdk, "run", fake_run(engine_text))
    a = api.post("/studio/agents", json=RECALL).json()
    r = api.post(f"/studio/agents/{a['id']}/deploy").json()
    live = [e for e in r["eval_results"] if "(live)" in e["case"]]
    assert len(live) == 3 and all(e["passed"] for e in live) and r["passed"], live


def test_live_gate_fails_when_sdk_unavailable(monkeypatch):
    async def down(*a, **kw):
        raise sdk.SdkUnavailable("rate limited")
    monkeypatch.setenv("STUDIO_GATE_LIVE", "1")
    monkeypatch.setattr(sdk, "run", down)
    a = api.post("/studio/agents", json=RECALL).json()
    r = api.post(f"/studio/agents/{a['id']}/deploy").json()
    assert r["passed"] is False and r["deployed_at"] is None
    assert all("SDK unavailable" in e["detail"] for e in r["eval_results"] if "(live)" in e["case"])


@pytest.mark.parametrize("fixes_it", [True, False])
def test_live_gate_sends_back_once_and_names_failed_checks(monkeypatch, fixes_it):
    from tests.test_agents import engine_text, fake_run
    calls = []

    def text_for(c):
        calls.append(c.id)
        resent = sum(x == c.id for x in calls) > 1
        return engine_text(c) if resent and fixes_it else f"{engine_text(c)} It's guaranteed to work."
    monkeypatch.setenv("STUDIO_GATE_LIVE", "1")
    monkeypatch.setattr(sdk, "run", fake_run(text_for))
    a = api.post("/studio/agents", json=RECALL).json()
    r = api.post(f"/studio/agents/{a['id']}/deploy").json()
    live = [e for e in r["eval_results"] if "(live)" in e["case"]]
    assert len(calls) == 6   # 3 cases × (first try + one send-back), never more
    assert all("Guardian revise (attempt 1): tone: Pressure or over-promising language" in e["detail"] for e in live)
    assert r["passed"] is fixes_it and all(e["passed"] is fixes_it for e in live)
    assert all(("passed after one send-back" in e["detail"]) is fixes_it for e in live)
    if not fixes_it:
        assert all("(attempt 2)" in e["detail"] and 'answer: "' in e["detail"] and "guaranteed" in e["detail"]
                   for e in live)


# ---- Contract gaps: customers, handoffs, sessions, recommendation review ----

def test_customers_list_search_and_get():
    assert len(api.get("/customers").json()) == 1200
    found = api.get("/customers", params={"q": "vishwaa"}).json()
    assert [c["id"] for c in found if c["id"].startswith("CUST-V")] == ["CUST-VISHWAA2026"]
    assert [c["id"] for c in api.get("/customers", params={"q": "cust-hung"}).json()] == ["CUST-HUNG2026"]
    j = api.get("/customers/CUST-SAMEERA2026").json()
    assert j["first_name"] == "Sameera" and j["synthetic"] is True
    assert api.get("/customers/CUST-NOPE").status_code == 404


def test_handoffs_create_list_claim_broadcast(monkeypatch):
    from agents import traces
    sent = []
    monkeypatch.setattr(traces, "broadcast", lambda ch, ev, payload: sent.append((ch, ev, payload)) or True)
    r = api.post("/handoffs", json={"customer_id": "CUST-HUNG2026", "reason": "Callback about deferral", "surface": "kiosk"})
    assert r.status_code == 201
    h = r.json()
    assert h["status"] == "waiting" and api.get("/handoffs").json()[0]["id"] == h["id"]
    assert api.patch(f"/handoffs/{h['id']}", json={"status": "claimed"}).status_code == 422
    u = api.patch(f"/handoffs/{h['id']}", json={"status": "claimed", "claimed_by": "EMP-ADVISOR-1"}).json()
    assert u["status"] == "claimed" and u["claimed_by"] == "EMP-ADVISOR-1"
    assert sent == [("handoffs", "created", h), ("handoffs", "updated", u)]
    assert api.patch("/handoffs/HND-NOPE", json={"status": "resolved"}).status_code == 404
    assert api.post("/handoffs", json={"customer_id": "CUST-NOPE", "reason": "x", "surface": "app"}).status_code == 404


def test_sessions_from_advisor_asks(monkeypatch):
    from tests.test_agents import engine_text, fake_run
    monkeypatch.setattr(sdk, "run", fake_run(engine_text))
    for _ in range(2):
        a = api.post("/agents/advisor/ask", json={"customer_id": "CUST-VISHWAA2026", "message": "What should I do at lease end?",
                                                  "session_id": "SES-B5", "surface": "kiosk", "language": "en"}).json()
    s = next(x for x in api.get("/sessions").json() if x["id"] == "SES-B5")
    assert s["customer_id"] == "CUST-VISHWAA2026" and s["surface"] == "kiosk" and s["last_trace_id"] == a["trace_id"]


def test_recommendation_review_approve_and_override():
    url = "/customers/CUST-SAMEERA2026/recommendation/review"
    assert api.post(url, json={"decision": "override", "reviewer": "EMP-ADVISOR-1"}).status_code == 422
    assert api.post(url, json={"decision": "approve", "reviewer": "advisor"}).status_code == 409
    e = api.post(url, json={"decision": "override", "reviewer": "EMP-ADVISOR-1", "override_option": "refinance",
                            "reason": "Customer wants to keep the Camry"}).json()
    assert e["action"] == "override_recommendation" and e["override_reason"] == "Customer wants to keep the Camry"
    assert "employee chose refinance" in e["detail"] and e["autonomy_level"] == "L3"
    assert any(x["id"] == e["id"] for x in api.get("/audit").json())
    rec = api.get("/customers/CUST-SAMEERA2026/recommendation").json()
    assert rec["review"] == {"status": "overridden", "by": "EMP-ADVISOR-1", "reason": "Customer wants to keep the Camry"}
    assert rec["recommended"]["option"] == "upgrade"   # a review never changes the engine's numbers
    api.post(url, json={"decision": "approve", "reviewer": "EMP-ADVISOR-1"})
    assert api.get("/customers/CUST-SAMEERA2026/recommendation").json()["review"]["status"] == "approved"


def test_reviews_summary_is_readable_titles_with_source():
    q = api.get("/market/Camry", params={"year": 2022}).json()
    assert q["reviews_summary"].startswith('Top YouTube reviews: "') and "(CarGurus)" in q["reviews_summary"]
    assert "SerpApi YouTube" in q["source"] and q["as_of"]
    from serpapi.market import clean_title
    assert clean_title("New Camry Unveiled! 🔥🚨 | Latest Review!") == "New Camry Unveiled! | Latest Review"
