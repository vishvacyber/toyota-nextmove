from datetime import date

import pytest

from engine import finance


def test_monthly_payment():
    assert finance.monthly_payment(10000, 0, 10) == 1000
    assert finance.monthly_payment(20000, 6, 60) == pytest.approx(386.66, abs=0.01)
    assert finance.monthly_payment(22750, 6.4, 60) == pytest.approx(444.07, abs=0.01)
    with pytest.raises(ValueError):
        finance.monthly_payment(1000, 5, 0)


def test_remaining_balance():
    assert finance.remaining_balance(20000, 6, 60, 0) == pytest.approx(20000)
    assert finance.remaining_balance(20000, 6, 60, 60) == pytest.approx(0, abs=0.01)
    assert finance.remaining_balance(12000, 0, 12, 6) == pytest.approx(6000)
    # Balance after k payments equals the present value of the payments still due.
    pmt = finance.monthly_payment(20000, 6, 60)
    pv = sum(pmt / 1.005 ** t for t in range(1, 25))
    assert finance.remaining_balance(20000, 6, 60, 36) == pytest.approx(pv, abs=0.01)


def test_lease_payment():
    # (30000 − 18000)/36 depreciation + (30000 + 18000) × 0.001 rent charge
    assert finance.lease_payment(30000, 18000, 2.4, 36) == pytest.approx(333.33 + 48, abs=0.01)


def test_market_value():
    curve = [1.0, 0.9, 0.8]
    assert finance.market_value(30000, 2, 24000, curve, 12000, 0.10) == pytest.approx(24000)
    assert finance.market_value(30000, 2, 30000, curve, 12000, 0.10) == pytest.approx(23400)   # 6,000 extra miles
    assert finance.market_value(30000, 9, 108000, curve, 12000, 0.10) == pytest.approx(24000)  # past table end: last value
    assert finance.market_value(1000, 1, 500000, curve, 12000, 0.10) == 0


def test_mileage_overage():
    assert finance.mileage_overage(45800, 12000, 36, 0.25) == (9800, 2450)
    assert finance.mileage_overage(30000, 12000, 36, 0.25) == (0, 0)


def test_deferral_interest():
    assert finance.deferral_interest(468, 4.9, 17) == pytest.approx(33.57, abs=0.01)
    assert finance.deferral_interest(468, 0, 17) == 0


def test_fuel():
    gas_cost, gas_co2 = finance.fuel(12000, 28, False, 3.40, 0.16, 33.7, 8.887, 0.37)
    assert gas_cost == pytest.approx(121.43, abs=0.01)
    assert gas_co2 == pytest.approx(3809, abs=1)
    ev_cost, ev_co2 = finance.fuel(12000, 114, True, 3.40, 0.16, 33.7, 8.887, 0.37)
    kwh = 12000 / 114 * 33.7
    assert ev_cost == pytest.approx(kwh * 0.16 / 12)
    assert ev_co2 == pytest.approx(kwh * 0.37)


@pytest.mark.parametrize("payday,freq,expected", [
    (date(2026, 10, 30), "biweekly", 17),    # day 31 doesn't fit; previous payday 16th → 17th
    (date(2026, 10, 10), "monthly", 11),
    (date(2026, 10, 30), "monthly", 28),     # capped so it exists every month
    (date(2026, 10, 29), "weekly", 23),
])
def test_aligned_due_day(payday, freq, expected):
    assert finance.aligned_due_day(payday, freq) == expected
