import threading
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from agents import orchestrator, recommend, sentinel, traces, vision
from agents.autonomy import AGENTS
from app.models import (
    AdvisorAnswer,
    AdvisorAsk,
    AgentTrace,
    Alert,
    AlertStatus,
    AlertUpdate,
    DealPacket,
    DealPacketCreate,
    Health,
    InspectionResult,
    MarketQuote,
    Model,
    Opportunity,
    PhotoAngle,
    Recommendation,
    ScenarioRequest,
    ScenarioSet,
    TimingPlan,
)
from engine import scenarios, timing
from engine.scenarios import CFG
from sim.generator import customers_by_id
from tools import ToolError, actions, market


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Sentinel's daily scan runs once per start, off the request path. Market Intel can spend SerpApi quota on
    # cache misses, so it runs only on purpose: python -m agents.market_intel
    threading.Thread(target=sentinel.run, daemon=True).start()
    yield


app = FastAPI(title="Toyota NextMove API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # shortcut: any localhost port, so parallel dev servers work; list real origins when the frontends deploy.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
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
              or (o.down_payment is not None and o.down_payment < 0) or (o.annual_miles is not None and o.annual_miles < 0)
              or (o.months_from_now is not None and not 0 <= o.months_from_now <= 24)):
        raise HTTPException(422, "Overrides must be non-negative, term_months positive, months_from_now 0-24")
    return scenarios.run(req, customer)


@app.get("/customers/{id}/timing", response_model=TimingPlan)
def get_timing(id: str) -> TimingPlan:
    return timing.timing(_customer(id))


@app.post("/inspections", response_model=InspectionResult)
async def create_inspection(customer_id: Annotated[str, Form()], photos: Annotated[list[UploadFile], File()],
                            angles: Annotated[list[PhotoAngle] | None, Form()] = None) -> InspectionResult:
    """Photos are read into memory for the vision call and never written anywhere."""
    _customer(customer_id)
    ins = CFG["inspection"]
    if not 1 <= len(photos) <= ins["max_photos"]:
        raise HTTPException(422, f"Send 1-{ins['max_photos']} photos")
    if angles and len(angles) != len(photos):
        raise HTTPException(422, "Send one angle per photo")
    angles = angles or list(PhotoAngle)[:len(photos)]
    batch = []
    for angle, photo in zip(angles, photos, strict=True):
        if photo.content_type not in ins["media_types"]:
            raise HTTPException(422, f"Photos must be JPEG, PNG or WebP (got {photo.content_type})")
        data = await photo.read(ins["max_bytes"] + 1)
        if not data or len(data) > ins["max_bytes"]:
            raise HTTPException(422, f"Each photo must be under {ins['max_bytes'] // 1_000_000} MB")
        batch.append((angle.value, photo.content_type, data))
    return await vision.inspect(customer_id, batch)


@app.get("/deal-packets", response_model=list[DealPacket])
def list_deal_packets(customer_id: str | None = None) -> list[DealPacket]:
    return [p for p in reversed(actions.STORE["deal_packets"]) if customer_id in (None, p.customer_id)]


@app.post("/deal-packets", response_model=DealPacket, status_code=201)
def create_deal_packet(body: DealPacketCreate) -> DealPacket:
    _customer(body.customer_id)
    try:
        return actions.create_deal_packet(body)
    except ToolError as e:
        raise HTTPException(422, str(e)) from e
    except LookupError as e:
        raise HTTPException(404, str(e)) from e


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
