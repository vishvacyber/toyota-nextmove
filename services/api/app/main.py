import asyncio
import os
import re
import threading
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from agents import live, orchestrator, recommend, sdk, sentinel, studio, traces, vision
from agents.autonomy import AGENTS
from app.models import (
    AdvisorAnswer,
    AdvisorAsk,
    AgentTrace,
    Alert,
    AlertStatus,
    AlertUpdate,
    Assumptions,
    AuditEntry,
    AutonomyLevel,
    Call,
    CallMessage,
    Customer,
    CustomerAction,
    CustomerActionType,
    DealPacket,
    DealPacketCreate,
    Decision,
    DeployResult,
    Estimate,
    EstimateRequest,
    FairnessReport,
    Handoff,
    HandoffCreate,
    HandoffUpdate,
    Health,
    InspectionResult,
    KpiSnapshot,
    MarketQuote,
    Model,
    Offer,
    OfferCreate,
    OfferSimulation,
    Opportunity,
    OptionType,
    PhotoAngle,
    Recommendation,
    RecommendationReview,
    Review,
    ScenarioRequest,
    ScenarioSet,
    Session,
    Status3,
    Status4,
    StudioAgent,
    StudioAgentCreate,
    Surface,
    Takeover,
    TimingPlan,
)
from engine import estimate, scenarios, timing
from engine.scenarios import CFG
from sim import simulate
from sim.generator import customers_by_id
from tools import ToolError, actions, market, store

# The browsers that may use this API: any localhost port (parallel dev servers). The REST API enforces it with CORS;
# WebSockets skip CORS, so /voice checks the same pattern itself.
LOCAL_ORIGIN = re.compile(r"http://(localhost|127\.0\.0\.1)(:\d+)?")
PERSONAS = ["CUST-VISHWAA2026", "CUST-SAMEERA2026", "CUST-HUNG2026"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Durable demo state comes back from Supabase first (handoffs, packets, offers, Studio, audit, AI explanations).
    actions.hydrate(), studio.hydrate(), recommend.hydrate(), hydrate_reviews(), live.hydrate()
    # Sentinel's daily scan runs once per start, off the request path. Market Intel can spend SerpApi quota on
    # cache misses, so it runs only on purpose: python -m agents.market_intel
    threading.Thread(target=lambda: (sentinel.run(), simulate.kpis()), daemon=True).start()   # + warm the simulation
    # The personas' AI explanations are written before anyone asks (no-op when already saved for today's numbers).
    warm = asyncio.create_task(recommend.warm(PERSONAS)) if os.environ.get("NEXTMOVE_WARM", "1") == "1" else None
    yield
    if warm:
        warm.cancel()


app = FastAPI(title="Toyota NXT API", version="0.1.0", lifespan=lifespan)


@app.exception_handler(sdk.Busy)
async def busy(_: Request, e: sdk.Busy) -> JSONResponse:
    """AI only: when nothing Guardian-checked is ready, say so and let the app retry. Never a canned answer."""
    return JSONResponse({"detail": str(e)}, status_code=503, headers={"Retry-After": "5"})


def hydrate_reviews() -> None:
    for data in store.load("reviews"):
        recommend.REVIEWS[data["customer_id"]] = Review.model_validate(data["review"])
app.add_middleware(
    CORSMiddleware,
    # shortcut: any localhost port, so parallel dev servers work; list real origins when the frontends deploy.
    allow_origin_regex=LOCAL_ORIGIN.pattern,
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


@app.get("/customers", response_model=list[Customer])
def list_customers(q: str | None = None) -> list[Customer]:
    """Search by id or name (case-insensitive substring). Generated customers only (no real customer data)."""
    q = (q or "").strip().lower()
    return [c for c in customers_by_id().values()
            if not q or q in c.id.lower() or q in f"{c.first_name} {c.last_name}".lower()]


@app.get("/customers/{id}", response_model=Customer)
def get_customer(id: str) -> Customer:
    return _customer(id)


@app.post("/customers/{id}/recommendation/review", response_model=AuditEntry)
def review_recommendation(id: str, body: RecommendationReview) -> AuditEntry:
    c = _customer(id)
    if body.reviewer in AGENTS:
        raise HTTPException(409, "A review needs an employee; an agent can't review its own recommendation")
    override = body.decision == Decision.override
    if override and not (body.reason or "").strip():
        raise HTTPException(422, "An override needs a reason")
    rec = recommend.pick(c.situation, recommend.scenario_set(c))
    detail = f"Engine recommended {rec.option.value}" + \
        (f"; employee chose {body.override_option.value}" if override and body.override_option else "")
    entry = actions.log_decision(actions.DecisionIn(
        actor=body.reviewer, action=f"{body.decision.value}_recommendation", autonomy_level=AutonomyLevel.L3,
        customer_id=c.id, detail=detail, override_reason=body.reason if override else None,
        trace_id=recommend.cached_trace_id(c)))
    review = Review(status=Status3.overridden if override else Status3.approved, by=body.reviewer, reason=body.reason)
    recommend.REVIEWS[c.id] = review
    store.save("reviews", c.id, {"customer_id": c.id, "review": review.model_dump(mode="json")})
    return entry


@app.post("/customers/{id}/actions", response_model=AuditEntry, status_code=201)
def record_customer_action(id: str, body: CustomerAction) -> AuditEntry:
    """The customer's own confirmed tap (L3 consent). Recorded in the audit log, so the console sees it."""
    c = _customer(id)
    if body.type == CustomerActionType.due_date_change and body.option != OptionType.due_date_change:
        raise HTTPException(422, "A due-date change records the due_date_change option")
    s = scenarios.run(ScenarioRequest(customer_id=c.id, options=[body.option]), c).scenarios[0]
    if not s.eligible:
        raise HTTPException(422, s.ineligible_reason or f"{body.option.value} isn't available for this customer")
    return actions.log_decision(actions.DecisionIn(
        actor=c.id, action=f"{body.type.value} {body.option.value}", autonomy_level=AutonomyLevel.L3,
        customer_id=c.id, detail=body.detail or f"Customer confirmed {s.label} in the app"))


@app.post("/scenarios", response_model=ScenarioSet)
def run_scenarios(req: ScenarioRequest) -> ScenarioSet:
    customer = _customer(req.customer_id)
    o = req.overrides
    if o and ((o.term_months is not None and o.term_months <= 0) or (o.apr is not None and o.apr < 0)
              or (o.down_payment is not None and o.down_payment < 0) or (o.annual_miles is not None and o.annual_miles < 0)
              or (o.months_from_now is not None and not 0 <= o.months_from_now <= 24)):
        raise HTTPException(422, "Overrides must be non-negative, term_months positive, months_from_now 0-24")
    return scenarios.run(req, customer)


@app.post("/estimate", response_model=Estimate)
def walk_in_estimate(req: EstimateRequest) -> Estimate:
    return estimate.estimate(req)


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


@app.get("/handoffs", response_model=list[Handoff])
def list_handoffs() -> list[Handoff]:
    return list(reversed(actions.STORE["handoffs"]))


@app.post("/handoffs", response_model=Handoff, status_code=201)
def create_handoff(body: HandoffCreate) -> Handoff:
    _customer(body.customer_id)
    h = actions.handoff_to_human(body)
    traces.broadcast("handoffs", "created", h.model_dump(mode="json"))
    return h


@app.patch("/handoffs/{id}", response_model=Handoff)
def update_handoff(id: str, body: HandoffUpdate) -> Handoff:
    hs = actions.STORE["handoffs"]
    i = next((i for i, h in enumerate(hs) if h.id == id), None)
    if i is None:
        raise HTTPException(404, f"Unknown handoff {id}")
    if body.status == Status4.claimed and not (body.claimed_by or hs[i].claimed_by):
        raise HTTPException(422, "Claiming a handoff needs claimed_by")
    h = actions.keep("handoffs", hs[i].model_copy(update=body.model_dump(exclude_none=True)))
    traces.broadcast("handoffs", "updated", h.model_dump(mode="json"))
    return h


def _call(id: str) -> Call:
    c = live.CALLS.get(id)
    if c is None:
        raise HTTPException(404, f"Unknown call {id}")
    return c


@app.get("/calls", response_model=list[Call])
def list_calls() -> list[Call]:
    return sorted(live.CALLS.values(), key=lambda c: c.started_at, reverse=True)


@app.post("/calls/{id}/takeover", response_model=Call)
async def take_over_call(id: str, body: Takeover) -> Call:
    if body.employee in AGENTS:
        raise HTTPException(409, "Only an employee can take over a call")
    return await live.take_over(_call(id), body.employee)


@app.post("/calls/{id}/messages", response_model=Call)
async def send_call_message(id: str, body: CallMessage) -> Call:
    c = _call(id)
    if c.status != live.CallStatus.human:
        raise HTTPException(409, "Take the call over before messaging the customer")
    return await live.rep_says(c, body.text)


@app.websocket("/voice/{customer_id}")
async def voice(ws: WebSocket, customer_id: str, lang: str = "en", surface: Surface = Surface.kiosk) -> None:
    """Live voice call (Gemini Live). Protocol in agents/live.py; not expressible in OpenAPI."""
    origin = ws.headers.get("origin")
    if origin is not None and not LOCAL_ORIGIN.fullmatch(origin):   # another website open in the kiosk's browser
        await ws.close(code=4403)
        return
    if customer_id != live.GUEST and customer_id not in customers_by_id():
        await ws.close(code=4404)
        return
    await live.session(ws, customer_id, "es" if lang == "es" else "en", surface)


@app.get("/sessions", response_model=list[Session])
def list_sessions() -> list[Session]:
    return sorted(orchestrator.SESSION_INFO.values(), key=lambda s: s.started_at, reverse=True)


@app.get("/market/{model}", response_model=MarketQuote)
def get_market(model: Model, year: int | None = None) -> MarketQuote:
    return market.quote(model.value, year)


@app.post("/agents/advisor/ask", response_model=AdvisorAnswer)
async def ask_advisor(req: AdvisorAsk) -> AdvisorAnswer:
    _customer(req.customer_id)
    return await orchestrator.ask(req)


@app.get("/customers/{id}/recommendation", response_model=Recommendation)
async def get_recommendation(id: str) -> Recommendation:
    return await recommend.recommendation(_customer(id))


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
    if body.status:
        actions.log_decision(actions.DecisionIn(
            actor=body.actor or a.customer_id, action=f"alert_{body.status.value} {a.id}", autonomy_level=a.autonomy_level,
            customer_id=a.customer_id, detail="Customer consent" if body.consent else None, trace_id=a.trace_id))
    return a


@app.get("/kpis", response_model=KpiSnapshot)
def get_kpis(adoption_rate: Annotated[float | None, Query(ge=0, le=1)] = None,
             outreach_lead_days: Annotated[int | None, Query(ge=0, le=365)] = None,
             hardship_uptake: Annotated[float | None, Query(ge=0, le=1)] = None) -> KpiSnapshot:
    d = simulate.defaults()
    return simulate.kpis(Assumptions(
        adoption_rate=d.adoption_rate if adoption_rate is None else adoption_rate,
        outreach_lead_days=d.outreach_lead_days if outreach_lead_days is None else outreach_lead_days,
        hardship_uptake=d.hardship_uptake if hardship_uptake is None else hardship_uptake))


@app.get("/fairness", response_model=FairnessReport)
def get_fairness() -> FairnessReport:
    return simulate.fairness(actions.STORE["offers"])


@app.get("/audit", response_model=list[AuditEntry])
def list_audit() -> list[AuditEntry]:
    """Decisions the tools logged (log_decision) plus one entry per agent trace."""
    from_traces = [AuditEntry(id=f"AUD-{t.id}", at=t.started_at, actor=t.agent.root, action=t.action.type,
                              customer_id=t.customer_id, autonomy_level=t.action.autonomy_level, trace_id=t.id,
                              detail=f"{t.action.status.value.replace('_', ' ')}; Guardian {t.guardian.verdict.value}")
                   for t in traces.list_traces()]
    return sorted([*actions.STORE["audit"], *from_traces], key=lambda e: e.at, reverse=True)


def _offer(id: str) -> Offer:
    o = next((o for o in actions.STORE["offers"] if o.id == id), None)
    if o is None:
        raise HTTPException(404, f"Unknown offer {id}")
    return o


@app.get("/offers", response_model=list[Offer])
def list_offers() -> list[Offer]:
    return list(reversed(actions.STORE["offers"]))


@app.post("/offers", response_model=Offer, status_code=201)
def create_offer(body: OfferCreate) -> Offer:
    if body.variant_of:
        _offer(body.variant_of)
    try:
        simulate.parse_rule(body.rule)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return actions.create_offer_draft(body)


@app.post("/offers/{id}/simulate", response_model=OfferSimulation)
def simulate_offer(id: str) -> OfferSimulation:
    o = _offer(id)
    return simulate.simulate_offer(o, [v for v in actions.STORE["offers"] if v.variant_of == o.id])


@app.get("/studio/agents", response_model=list[StudioAgent])
def list_studio_agents() -> list[StudioAgent]:
    return studio.list_agents()


@app.post("/studio/agents", response_model=StudioAgent, status_code=201)
def create_studio_agent(body: StudioAgentCreate) -> StudioAgent:
    return studio.create(body)


@app.post("/studio/agents/{id}/deploy", response_model=DeployResult)
async def deploy_studio_agent(id: str) -> DeployResult:
    if id not in studio.AGENTS:
        raise HTTPException(404, f"Unknown agent {id}")
    return await studio.deploy(id)
