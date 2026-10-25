"""Action tools. Autonomy (CLAUDE.md rule 3): drafts are L2; anything customer-facing is L3 and waits for consent.
shortcut: state lives in memory per process; B3 persists it to Supabase with the traces."""

import itertools
from datetime import UTC, datetime

from pydantic import AwareDatetime, BaseModel, Field

from app.models import (
    AuditEntry,
    AutonomyLevel,
    Dealer,
    DealPacket,
    DealPacketCreate,
    Handoff,
    HandoffCreate,
    InspectionResult,
    Offer,
    OfferCreate,
    Overrides,
    ScenarioRequest,
    Status4,
    Status6,
    Status7,
)
from engine import scenarios
from engine.scenarios import CFG
from serpapi import client, market, queries
from tools.customer import customer
from tools.registry import ToolError, tool

STORE: dict[str, list] = {"appointments": [], "offers": [], "handoffs": [], "audit": [], "inspections": [], "deal_packets": []}
_ids = itertools.count(1)


def new_id(prefix: str) -> str:
    return f"{prefix}-{next(_ids):04d}"


def now() -> datetime:
    return datetime.now(UTC)


class AppointmentIn(BaseModel):
    customer_id: str
    dealer_id: str
    at: AwareDatetime
    purpose: str = Field(examples=["Lease-end inspection", "Test drive: Camry SE Hybrid"])


@tool(AutonomyLevel.L3)
def book_appointment(args: AppointmentIn) -> dict:
    """Request a dealer appointment. L3: stays pending until the customer consents; never booked automatically."""
    customer(args.customer_id)
    appt = {"id": new_id("APT"), **args.model_dump(mode="json"), "status": "pending_approval",
            "autonomy_level": AutonomyLevel.L3.value, "note": "Needs the customer's consent before it is booked."}
    STORE["appointments"].append(appt)
    return appt


@tool(AutonomyLevel.L2)
def create_offer_draft(args: OfferCreate) -> Offer:
    """Draft a retention offer for employee review. L2: always a draft; an employee activates it."""
    offer = Offer(id=new_id("OFR"), name=args.name, rule=args.rule, target_situation=args.target_situation,
                  incentive=args.incentive.model_dump(), status=Status7.draft, variant_of=args.variant_of, created_at=now())
    STORE["offers"].append(offer)
    return offer


@tool(AutonomyLevel.L3)
def handoff_to_human(args: HandoffCreate) -> Handoff:
    """Hand the conversation to a TFS specialist; it waits in the console queue for someone to claim it."""
    customer(args.customer_id)
    h = Handoff(id=new_id("HND"), customer_id=args.customer_id, reason=args.reason, surface=args.surface,
                status=Status4.waiting, context_summary=args.reason, callback_at=args.callback_at, created_at=now())
    STORE["handoffs"].append(h)
    return h


class DecisionIn(BaseModel):
    actor: str = Field(description="Agent name or employee id")
    action: str
    autonomy_level: AutonomyLevel
    customer_id: str | None = None
    detail: str | None = None
    trace_id: str | None = None


@tool()
def log_decision(args: DecisionIn) -> AuditEntry:
    """Append a decision to the audit log (who, what, autonomy level, linked trace)."""
    entry = AuditEntry(id=new_id("AUD"), at=now(), **args.model_dump())
    STORE["audit"].append(entry)
    return entry


class InspectionIn(BaseModel):
    customer_id: str


@tool()
def inspect_photos(args: InspectionIn) -> InspectionResult:
    """The customer's latest lease-end photo pre-inspection (items and estimated charges from the engine wear table).
    Photos are taken in the app (POST /inspections); without one this returns the standard wear estimate."""
    customer(args.customer_id)
    latest = next((r for r in reversed(STORE["inspections"]) if r.customer_id == args.customer_id), None)
    return latest or InspectionResult(
        id=new_id("INS"), customer_id=args.customer_id, items=[], total_estimated_charge=CFG["fees"]["wear_estimate"],
        is_estimate=True, created_at=now(),
        disclaimer="No photo pre-inspection yet. This is the standard wear estimate; take photos in the app for a "
                   "personal estimate.")


def create_deal_packet(body: DealPacketCreate) -> DealPacket:
    """Engine scenario + eligibility for one option, sent to a dealer from the cached SerpApi dealer search (never
    spends quota). The customer pressing "Send" is the L3 consent, so it goes out as `sent`."""
    c = customer(body.customer_id)
    ss = scenarios.run(ScenarioRequest(customer_id=c.id, options=[body.option],
                                       overrides=Overrides(target_model=body.target_model)), c)
    s = ss.scenarios[0]
    if not s.eligible:
        raise ToolError(s.ineligible_reason or "Not eligible")
    row = client.cached_only(*queries.dealers(c.region.value))
    found = market.parse_dealers(row["response"], c.region.value) if row else []
    pick = next((d for d in found if d["id"] == body.dealer_id), None) if body.dealer_id else (found or [None])[0]
    if pick is None:
        raise LookupError(f"Dealer {body.dealer_id} not found" if body.dealer_id and found
                          else f"No dealer data cached for {c.region.value}")
    packet = DealPacket(id=new_id("DLP"), customer_id=c.id, dealer=Dealer(**{k: v for k, v in pick.items() if k != "data_id"}),
                        vehicle=c.vehicle, target_vehicle=s.target_vehicle, scenario=s,
                        eligibility=scenarios.passed_rules(body.option, scenarios.facts(c)), status=Status6.sent,
                        created_at=now())
    STORE["deal_packets"].append(packet)
    log_decision(DecisionIn(actor=c.id, action=f"send_deal_packet {packet.id} to {packet.dealer.name}",
                            autonomy_level=AutonomyLevel.L3, customer_id=c.id, detail="Customer consented in the app"))
    return packet
