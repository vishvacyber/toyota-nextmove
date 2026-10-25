"""Customer, scenario, eligibility and timing tools. Every number comes from engine.scenarios / engine.finance."""

import re
from difflib import SequenceMatcher

from pydantic import BaseModel, Field

from app.models import Customer, OptionType, Overrides, ScenarioRequest, ScenarioSet, TimingPlan
from engine import scenarios, timing
from sim.generator import customers_by_id
from tools.registry import ToolError, tool


class CustomerIn(BaseModel):
    customer_id: str = Field(examples=["CUST-VISHWAA2026"])


def customer(customer_id: str) -> Customer:
    c = customers_by_id().get(customer_id)
    if c is None:
        raise ToolError(f"Unknown customer {customer_id}")
    return c


@tool()
def get_customer(args: CustomerIn) -> dict:
    """Customer profile, vehicle, contract and payment history. Name, email and phone are masked (PII stays out of the LLM)."""
    c = customer(args.customer_id)
    return {**c.model_dump(mode="json"), "first_name": "[masked]", "last_name": "[masked]", "email": None, "phone": None,
            "pii_masked": True}


class IdentifyIn(BaseModel):
    name: str = Field(description="The caller's first name or customer ID, as they said it")
    vehicle_model: str = Field(description="The Toyota model the caller says they drive, as they said it")


def _key(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def _sounds_like(said: str, name: str) -> bool:
    """Speech-to-text spells names its own way ("Vishwa" for Vishwaa, "Samira" for Sameera): compare with doubled
    letters collapsed, and accept a close match. The car and a single match still have to agree."""
    a, b = (re.sub(r"(.)\1+", r"\1", _key(x)) for x in (said, name))
    return a == b or (len(a) >= 3 and SequenceMatcher(None, a, b).ratio() >= 0.75)


@tool()
def identify_customer(args: IdentifyIn) -> dict:
    """Find the caller's own account on a voice call: their first name (or customer ID) plus the Toyota they drive must
    both match exactly one account. Returns only the customer ID, never account details."""
    name, said = _key(args.name), _key(re.sub(r"\bfour\b", "4", args.vehicle_model, flags=re.IGNORECASE))   # "RAV four"
    hits = [c for c in customers_by_id().values()
            if (name in (_key(c.id), _key(c.id).removeprefix("CUST")) or _sounds_like(args.name, c.first_name))
            and said.startswith(_key(c.vehicle.model.value))]   # "RAV4 Hybrid" and "bZ4X" still match RAV4 and bZ
    if len(hits) == 1:
        return {"verified": True, "customer_id": hits[0].id}
    return {"verified": False, "reason": "More than one account matches; ask for the customer ID" if hits
            else "No account matches that name and vehicle"}


class ScenarioIn(CustomerIn):
    options: list[OptionType] | None = Field(None, description="Only these options; omit for every eligible option")
    overrides: Overrides | None = None


@tool()
def run_scenario(args: ScenarioIn) -> ScenarioSet:
    """Run the finance engine: monthly payment, total cost, equity and fees per option, with assumptions."""
    req = ScenarioRequest(customer_id=args.customer_id, options=args.options, overrides=args.overrides)
    return scenarios.run(req, customer(args.customer_id))


class EligibilityIn(CustomerIn):
    option: OptionType


@tool()
def check_eligibility(args: EligibilityIn) -> dict:
    """Whether one option is available to this customer, and the rule's reason when it isn't."""
    reason = scenarios.ineligible_reason(args.option, scenarios.facts(customer(args.customer_id)))
    return {"customer_id": args.customer_id, "option": args.option.value, "eligible": reason is None, "reason": reason}


class TimingIn(CustomerIn):
    months: int = Field(6, ge=1, le=12)


@tool()
def get_timing(args: TimingIn) -> TimingPlan:
    """Month-by-month equity, payment, fees and net position if the customer acts now vs later, the best month, and
    "act now vs wait 3 months" in $ (engine timing optimizer)."""
    return timing.timing(customer(args.customer_id), args.months)
