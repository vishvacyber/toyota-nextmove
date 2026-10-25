"""Deterministic synthetic customer generator. Same seed → same 1,200 customers, every run.

No protected attributes: no age, sex, race, religion, national origin, marital or family status.
Names are drawn from gender-neutral lists and never reach the LLM (customer IDs do).
"""

import random
from datetime import timedelta
from functools import cache

from app.models import Customer
from engine import finance
from engine.finance import add_months
from engine.scenarios import CFG, TODAY, detect_situation

SEED = 42
COUNT = 1200

FIRST = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Jamie", "Drew", "Skyler", "Reese",
         "Cameron", "Rowan", "Sage", "Emerson", "Hayden", "Parker", "Logan", "Blake", "Kendall", "Peyton", "Finley", "Harper"]
LAST = ["Brooks", "Reed", "Hayes", "Price", "Foster", "Bennett", "Ward", "Cole", "Gray", "Perry", "Long", "Fisher", "Hunt",
        "Stone", "Lane", "Wells", "Burke", "Dunn", "Shaw", "Frost", "Rivera", "Nguyen", "Kim", "Patel", "Okafor", "Silva"]
MPG = {"Camry": {"gas": 32, "hybrid": 51}, "RAV4": {"gas": 30, "hybrid": 40}, "Tacoma": {"gas": 21},
       "Highlander": {"gas": 24, "hybrid": 35}, "Prius": {"hybrid": 57}, "bZ": {"ev": 114}}
TRIMS = ["LE", "SE", "XLE", "XSE", "Limited"]
COLORS = ["Silver", "White", "Gray", "Black", "Red", "Blue"]
REGIONS = ["South", "West", "Midwest", "Northeast"]
LIFE_EVENTS = ["job_change", "longer_commute", "relocation", "shorter_commute"]


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def personas() -> list[Customer]:
    """Maria, James, Priya: identical to packages/contracts/mocks/fixtures.ts."""
    return [Customer.model_validate(p) for p in [
        {"id": "CUST-MARIA", "first_name": "Maria", "last_name": "Alvarez", "email": "maria.a@example.test", "phone": "555-0101",
         "region": "South", "credit_tier": "A", "preferred_language": "en", "pay_frequency": "semimonthly", "next_payday": day(7),
         "vehicle": {"vin": "SYN2T3RAV4MARIA001", "model": "RAV4", "year": 2024, "trim": "XLE", "powertrain": "gas",
                     "color": "Blueprint", "odometer_miles": 41200, "mpg": 30},
         "contract": {"id": "LSE-1001", "type": "lease", "start_date": "2024-01-22", "maturity_date": day(90), "term_months": 36,
                      "monthly_payment": 389, "apr": 3.9, "payoff_amount": 23617, "residual_value": 22450,
                      "annual_mile_allowance": 12000, "excess_mile_fee": 0.25, "projected_miles_at_maturity": 45800,
                      "payments_made": 33, "days_past_due": 0, "status": "current", "due_day": 22},
         "payment_history": [{"date": "2026-09-22", "amount": 389, "status": "paid"}, {"date": "2026-10-22", "amount": 389, "status": "paid"}],
         "life_events": [], "risk_score": 0.08, "situation": "lease_end", "synthetic": True},
        {"id": "CUST-JAMES", "first_name": "James", "last_name": "Carter", "email": "james.c@example.test", "phone": "555-0102",
         "region": "West", "credit_tier": "A", "preferred_language": "en", "pay_frequency": "biweekly", "next_payday": day(4),
         "vehicle": {"vin": "SYN4T1CAMRYJAMES02", "model": "Camry", "year": 2022, "trim": "SE", "powertrain": "gas",
                     "color": "Midnight Black", "odometer_miles": 48900, "mpg": 28},
         "contract": {"id": "LN-2002", "type": "loan", "start_date": "2022-09-15", "maturity_date": "2028-09-15", "term_months": 72,
                      "monthly_payment": 496, "apr": 5.9, "payoff_amount": 10760, "payments_made": 49, "days_past_due": 0,
                      "status": "current", "due_day": 15},
         "payment_history": [{"date": "2026-09-15", "amount": 496, "status": "paid"}, {"date": "2026-10-15", "amount": 496, "status": "paid"}],
         "life_events": ["longer_commute"], "risk_score": 0.05, "situation": "positive_equity", "synthetic": True},
        {"id": "CUST-PRIYA", "first_name": "Priya", "last_name": "Shah", "email": "priya.s@example.test", "phone": "555-0103",
         "region": "Midwest", "credit_tier": "B", "preferred_language": "en", "pay_frequency": "biweekly", "next_payday": day(6),
         "vehicle": {"vin": "SYNJTDPRIUSPRIYA03", "model": "Prius", "year": 2023, "trim": "LE", "powertrain": "hybrid",
                     "color": "Wind Chill Pearl", "odometer_miles": 31500, "mpg": 57},
         "contract": {"id": "LN-3003", "type": "loan", "start_date": "2023-03-05", "maturity_date": "2028-03-05", "term_months": 60,
                      "monthly_payment": 468, "apr": 4.9, "payoff_amount": 7640, "payments_made": 43, "days_past_due": 19,
                      "status": "missed", "due_day": 5},
         "payment_history": [{"date": "2026-08-05", "amount": 468, "status": "paid"}, {"date": "2026-09-05", "amount": 468, "status": "late"},
                             {"date": "2026-10-05", "amount": 0, "status": "missed"}],
         "life_events": ["job_change"], "risk_score": 0.71, "situation": "payment_stress", "synthetic": True},
    ]]


def random_customer(rng: random.Random, i: int) -> Customer:
    first, last = rng.choice(FIRST), rng.choice(LAST)
    tier = rng.choices("ABCD", weights=[35, 35, 20, 10])[0]
    model = rng.choice(list(MPG))
    powertrain = rng.choice(list(MPG[model]))
    msrp = CFG["market"]["msrp"][model] * rng.uniform(0.92, 1.08)
    pace = min(max(rng.gauss(12500, 3000), 6000), 25000)   # miles/year
    lease = rng.random() < 0.4
    base_apr = CFG["rates"]["new_vehicle"][tier]
    # ~6% of accounts are behind; 1-14 days = late, 15+ = missed.
    dpd = rng.choice([4, 9, 12, 19, 26, 35, 48]) if rng.random() < 0.06 else 0

    if lease:
        term, elapsed = 36, rng.randint(1, 35)
        start = add_months(TODAY, -elapsed)
        year, apr = start.year, round(base_apr - 2 + rng.uniform(-0.5, 0.5), 1)
        residual = round(msrp * rng.uniform(0.58, 0.66))
        pmt = round(finance.lease_payment(msrp, residual, apr, term), 2)
        allowance = rng.choice([10000, 12000, 15000])
        odometer = round(pace * elapsed / 12)
        contract = {"type": "lease", "residual_value": residual, "annual_mile_allowance": allowance, "excess_mile_fee": 0.25,
                    "projected_miles_at_maturity": round(pace * term / 12), "payoff_amount": round(residual + pmt * (term - elapsed), 2)}
    else:
        term = rng.choice([48, 60, 72])
        elapsed = rng.randint(1, term - 1)
        start = add_months(TODAY, -elapsed)
        used_years = rng.choice([0, 0, 0, 1, 2, 3])
        year = start.year - used_years
        price = msrp * CFG["market"]["retention"][used_years]
        principal = price * rng.uniform(0.8, 0.95)   # after down payment
        apr = round(base_apr + rng.uniform(-1.5, 2.5), 1)
        pmt = round(finance.monthly_payment(principal, apr, term), 2)
        odometer = round(pace * (elapsed / 12 + used_years))
        contract = {"type": "loan", "payoff_amount": round(finance.remaining_balance(principal, apr, term, elapsed), 2)}

    # A missed payment means one fewer made than elapsed months.
    made = elapsed - (1 if dpd >= 15 else 0)
    status = "missed" if dpd >= 15 else "late" if dpd else "current"
    history = [{"date": add_months(start, made - k).isoformat(), "amount": pmt, "status": "paid"} for k in (2, 1, 0)]
    if dpd:
        history[-1].update(status=status, amount=0 if dpd >= 15 else pmt)
    events = [rng.choice(LIFE_EVENTS)] if rng.random() < 0.1 else []
    risk = min(0.03 + dpd * 0.012 + {"A": 0, "B": 0.05, "C": 0.12, "D": 0.2}[tier] + 0.1 * ("job_change" in events), 0.99)

    c = Customer.model_validate({
        "id": f"CUST-{i:05d}", "first_name": first, "last_name": last, "email": f"{first}.{last}{i}@example.test".lower(),
        "region": rng.choice(REGIONS), "credit_tier": tier, "preferred_language": "es" if rng.random() < 0.15 else "en",
        "pay_frequency": rng.choice(["weekly", "biweekly", "semimonthly", "monthly"]), "next_payday": day(rng.randint(1, 14)),
        "vehicle": {"vin": f"SYN{rng.randrange(16**14):014X}", "model": model, "year": year, "trim": rng.choice(TRIMS),
                    "powertrain": powertrain, "color": rng.choice(COLORS), "odometer_miles": odometer, "mpg": MPG[model][powertrain]},
        "contract": {**contract, "id": f"{'LSE' if lease else 'LN'}-{100000 + i}", "start_date": start.isoformat(),
                     "maturity_date": add_months(start, term).isoformat(), "term_months": term, "monthly_payment": pmt,
                     "apr": apr, "payments_made": made, "days_past_due": dpd, "status": status, "due_day": start.day},
        "payment_history": history, "life_events": events, "risk_score": round(risk, 2), "situation": "none", "synthetic": True,
    })
    return c.model_copy(update={"situation": detect_situation(c)})


def generate(count: int = COUNT, seed: int = SEED) -> list[Customer]:
    rng = random.Random(seed)
    return personas() + [random_customer(rng, i) for i in range(1, count - 2)]


@cache
def customers_by_id() -> dict[str, Customer]:
    # shortcut: regenerated in memory on startup (~0.2s); move to Supabase reads once keys exist (see seed_supabase.py).
    return {c.id: c for c in generate()}
