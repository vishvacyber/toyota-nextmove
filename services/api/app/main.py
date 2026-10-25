import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agents import orchestrator, recommend, sentinel, traces
from agents.autonomy import AGENTS
from app.models import (
    AdvisorAnswer,
    AdvisorAsk,
    AgentTrace,
    Alert,
    AlertStatus,
    AlertUpdate,
    Health,
    MarketQuote,
    Model,
    Opportunity,
    Recommendation,
    ScenarioRequest,
    ScenarioSet,
)
from engine import scenarios
from sim.generator import customers_by_id
from tools import market


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Sentinel's daily scan runs once per start, off the request path. Market Intel can spend SerpApi quota on
    # cache misses, so it runs only on purpose: python -m agents.market_intel
    threading.Thread(target=sentinel.run, daemon=True).start()
    yield


app = FastAPI(title="Toyota NextMove API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _customer(customer_id: str):
    c = customers_by_id().get(customer_id)
    if c is None:
        raise HTTPException(404, f"Unknown customer {customer_id}")
    return c


@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", version=app.version)


@app.post("/scenarios", response_model=ScenarioSet)
def run_scenarios(req: ScenarioRequest) -> ScenarioSet:
    customer = _customer(req.customer_id)
    o = req.overrides
    if o and ((o.term_months is not None and o.term_months <= 0) or (o.apr is not None and o.apr < 0)
              or (o.down_payment is not None and o.down_payment < 0) or (o.annual_miles is not None and o.annual_miles < 0)):
        raise HTTPException(422, "Overrides must be non-negative and term_months positive")
    return scenarios.run(req, customer)


@app.get("/market/{model}", response_model=MarketQuote)
def get_market(model: Model, year: int | None = None) -> MarketQuote:
    return market.quote(model.value, year)


@app.post("/agents/advisor/ask", response_model=AdvisorAnswer)
async def ask_advisor(req: AdvisorAsk) -> AdvisorAnswer:
    _customer(req.customer_id)
    return await orchestrator.ask(req)


@app.get("/customers/{id}/recommendation", response_model=Recommendation)
def get_recommendation(id: str) -> Recommendation:
    return recommend.recommendation(_customer(id))


@app.get("/opportunities", response_model=list[Opportunity])
def list_opportunities() -> list[Opportunity]:
    return sentinel.scan()


@app.get("/traces", response_model=list[AgentTrace])
def list_traces(customer_id: str | None = None) -> list[AgentTrace]:
    return traces.list_traces(customer_id)


@app.get("/alerts", response_model=list[Alert])
def list_alerts(customer_id: str | None = None, status: AlertStatus | None = None) -> list[Alert]:
    return [a for a in sentinel.ALERTS.values() if customer_id in (None, a.customer_id) and status in (None, a.status)]


@app.patch("/alerts/{id}", response_model=Alert)
def update_alert(id: str, body: AlertUpdate) -> Alert:
    a = sentinel.ALERTS.get(id)
    if a is None:
        raise HTTPException(404, f"Unknown alert {id}")
    if body.status == AlertStatus.approved and (not body.actor or body.actor in AGENTS):
        raise HTTPException(409, "Approval needs an employee as actor; an agent can't approve")
    if body.status == AlertStatus.sent and a.status != AlertStatus.approved:   # rule 3: customer-facing only after approval
        raise HTTPException(409, f"An {a.autonomy_level.value} alert can be sent only after it is approved")
    a = a.model_copy(update=body.model_dump(exclude_none=True, exclude={"actor"}))
    sentinel.ALERTS[id] = a
    return a
