"""Customer, scenario, eligibility and timing tools. Every number comes from engine.scenarios / engine.finance."""

from pydantic import BaseModel, Field

from app.models import Customer, Month, OptionType, Overrides, ScenarioRequest, ScenarioSet, TimingPlan
from engine import finance, scenarios
from sim.generator import add_months, customers_by_id
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
    """Month-by-month equity and payment if the customer acts now vs later.
    MINIMAL until B4: equity moves only with projected miles and the loan balance; the full optimizer lands in B4."""
    c, k = customer(args.customer_id), customer(args.customer_id).contract
    rem = scenarios.remaining_months(c)
    horizon = min(args.months, rem) if k.type == "lease" else args.months
    per_month = scenarios.annual_miles(c, Overrides()) / 12
    fees = scenarios.late_fee(c)
    rows = []
    for m in range(horizon + 1):
        v = c.vehicle.model_copy(update={"odometer_miles": round(c.vehicle.odometer_miles + per_month * m)})
        owed = k.residual_value if k.type == "lease" and k.residual_value is not None \
            else finance.remaining_balance(k.payoff_amount, k.apr, max(rem, 1), min(m, rem))
        equity = scenarios.market_value(v) - owed
        rows.append(Month(month_offset=m, date=add_months(scenarios.TODAY, m), equity=round(equity, 2),
                          payment=k.monthly_payment, fees=fees, net_position=round(equity - fees, 2)))
    best = max(rows, key=lambda r: r.net_position)
    wait = rows[min(3, len(rows) - 1)]
    delta = round(rows[0].net_position - wait.net_position, 2)
    summary = ("Preliminary: acting now keeps more equity than waiting." if delta > 0 else
               "Preliminary: waiting doesn't cost equity right now.") + " Full timing analysis is coming soon."
    return TimingPlan(customer_id=c.id, months=rows, best_month_offset=best.month_offset, act_now_vs_wait_3=delta,
                      summary=summary, as_of=scenarios.AS_OF)
