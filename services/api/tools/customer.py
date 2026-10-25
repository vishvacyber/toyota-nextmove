"""Customer, scenario, eligibility and timing tools. Every number comes from engine.scenarios / engine.finance."""

from pydantic import BaseModel, Field

from app.models import Customer, OptionType, Overrides, ScenarioRequest, ScenarioSet, TimingPlan
from engine import scenarios, timing
from sim.generator import customers_by_id
from tools.registry import ToolError, tool


class CustomerIn(BaseModel):
    customer_id: str = Field(examples=["CUST-MARIA"])


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
