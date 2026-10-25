from fastapi.testclient import TestClient

from app import models
from app.main import app


def test_health():
    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_models_cover_contract_entities():
    # SPEC §6 entities must exist as Pydantic models generated from openapi.yaml.
    for name in ["Customer", "Vehicle", "Contract", "Scenario", "Recommendation", "Alert", "Handoff", "DealPacket",
                 "InspectionResult", "Offer", "AgentTrace", "MarketQuote", "KpiSnapshot"]:
        assert hasattr(models, name), name
