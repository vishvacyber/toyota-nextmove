"""Action tools. Autonomy (CLAUDE.md rule 3): drafts are L2; anything customer-facing is L3 and waits for consent.
shortcut: state lives in memory per process; B3 persists it to Supabase with the traces."""

import itertools
from datetime import UTC, datetime

from pydantic import AwareDatetime, BaseModel, Field

from app.models import (
    AuditEntry,
    AutonomyLevel,
    Handoff,
    HandoffCreate,
    InspectionResult,
    Offer,
    OfferCreate,
    PhotoAngle,
    Status4,
    Status7,
)
from engine.scenarios import CFG
from tools.customer import customer
from tools.registry import tool

STORE: dict[str, list] = {"appointments": [], "offers": [], "handoffs": [], "audit": [], "inspections": []}
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


class Photo(BaseModel):
    angle: PhotoAngle
    url: str | None = None


class InspectionIn(BaseModel):
    customer_id: str
    photos: list[Photo] = Field(min_length=1)


@tool()
def inspect_photos(args: InspectionIn) -> InspectionResult:
    """Lease-end photo pre-inspection. MINIMAL until B4 (vision): flags no items and returns the standard wear
    estimate from engine config, clearly labelled as such."""
    customer(args.customer_id)
    result = InspectionResult(
        id=new_id("INS"), customer_id=args.customer_id, items=[], total_estimated_charge=CFG["fees"]["wear_estimate"],
        is_estimate=True, created_at=now(),
        disclaimer="Photo analysis isn't available yet. This is the standard wear estimate, not a review of your photos.")
    STORE["inspections"].append(result)
    return result
