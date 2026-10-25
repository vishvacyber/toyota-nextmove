"""Pure finance formulas. No I/O, no config: every input is an argument so each one is unit-testable."""

from datetime import date, timedelta


def monthly_payment(principal: float, apr: float, months: int) -> float:
    """Level payment that amortizes `principal` over `months` at `apr` percent."""
    if months <= 0:
        raise ValueError("months must be positive")
    r = apr / 1200
    if r == 0:
        return principal / months
    return principal * r / (1 - (1 + r) ** -months)


def remaining_balance(principal: float, apr: float, months: int, paid: int) -> float:
    """Balance left after `paid` level payments on a loan of `principal` over `months`."""
    pmt = monthly_payment(principal, apr, months)
    r = apr / 1200
    if r == 0:
        return max(principal - pmt * paid, 0.0)
    growth = (1 + r) ** paid
    return max(principal * growth - pmt * (growth - 1) / r, 0.0)


def lease_payment(cap_cost: float, residual: float, apr: float, months: int) -> float:
    """Depreciation fee + rent charge, with money factor = APR / 2400."""
    return (cap_cost - residual) / months + (cap_cost + residual) * apr / 2400


def market_value(msrp: float, age_years: int, odometer: int, retention: list[float],
                 expected_miles_per_year: int, per_mile_adjust: float) -> float:
    """Depreciation-table value, adjusted for miles above or below the expected pace. Never negative."""
    curve = retention[min(max(age_years, 0), len(retention) - 1)]
    expected = expected_miles_per_year * max(age_years, 0)
    return max(msrp * curve - (odometer - expected) * per_mile_adjust, 0.0)


def mileage_overage(projected_miles: int, annual_allowance: int, term_months: int, fee_per_mile: float) -> tuple[int, float]:
    """(miles over the lease allowance, charge for them)."""
    over = max(projected_miles - round(annual_allowance * term_months / 12), 0)
    return over, over * fee_per_mile


def deferral_interest(payment: float, apr: float, remaining_months: int) -> float:
    """Extra interest from moving one payment to the end of the loan (it accrues for the remaining term)."""
    return payment * ((1 + apr / 1200) ** remaining_months - 1)


def fuel(miles_per_year: float, mpg: float, ev: bool, gas_price: float, electricity_price: float,
         kwh_per_gallon_equivalent: float, co2_kg_per_gallon: float, co2_kg_per_kwh: float) -> tuple[float, float]:
    """(fuel or charging $/month, CO2 kg/year). For EVs `mpg` is MPGe."""
    gallons = miles_per_year / mpg
    if ev:
        kwh = gallons * kwh_per_gallon_equivalent
        return kwh * electricity_price / 12, kwh * co2_kg_per_kwh
    return gallons * gas_price / 12, gallons * co2_kg_per_gallon


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    return date(d.year + y, m + 1, min(d.day, 28))


def aligned_due_day(next_payday: date, pay_frequency: str) -> int:
    """Day of month just after a payday, kept within 1..28 so it exists every month."""
    step = {"weekly": 7, "biweekly": 14}.get(pay_frequency, 0)
    d = next_payday
    while step and (d + timedelta(days=1)).day > 28:
        d -= timedelta(days=step)
    return min((d + timedelta(days=1)).day, 28)
