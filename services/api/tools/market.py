"""Market tools over the SerpApi cache: market quote, dealers, recalls. Source + as-of on every number (rule 10)."""

from pydantic import BaseModel, Field

from app.models import Dealer, Estimate, EstimateRequest, MarketQuote, Model, Recall, Region, Trend
from engine import estimate, finance, scenarios
from engine.scenarios import AS_OF, CFG, TODAY
from serpapi import client, market
from serpapi import queries as q
from tools.registry import ToolError, tool


def defaults(model: str) -> tuple[int, str]:
    """A persona's year and region for this model (so the demo hits the seeded cache), else a 2-year-old car in the South."""
    return next(((y, r) for m, y, r in q.PERSONA_VEHICLES if m == model), (TODAY.year - 2, "South"))


class Lookups:
    """Collects the cache rows a response used, for its source and as-of."""

    def __init__(self) -> None:
        self.rows: list[dict] = []

    def get(self, req: tuple[str, dict]) -> dict | None:
        try:
            row = client.search(*req)
        except client.CacheMiss:
            return None
        self.rows.append(row)
        return row["response"]

    @property
    def source(self) -> str:
        return ", ".join(dict.fromkeys(r["source"] for r in self.rows)) or CFG["market"]["source"]

    @property
    def as_of(self) -> str:
        return min((r["fetched_at"] for r in self.rows), default=AS_OF.isoformat())

    @property
    def cached(self) -> bool:
        return all(r["cached"] for r in self.rows)


def dealers(region: str, lk: Lookups, n: int = 3) -> tuple[list[Dealer], list[dict]]:
    resp = lk.get(q.dealers(region))
    found = market.parse_dealers(resp, region)[:n] if resp else []
    reviews = market.parse_reviews(lk.get(q.dealer_reviews(found[0]["data_id"])) or {}) if found else []
    return [Dealer(**{k: v for k, v in d.items() if k != "data_id"}) for d in found], reviews


class MarketIn(BaseModel):
    model: Model
    year: int | None = Field(None, description="Model year; defaults to the demo persona's year for this model")
    region: Region | None = Field(None, description="Dealer search region; defaults by model")


def quote(model: str, year: int | None = None, region: str | None = None) -> MarketQuote:
    y, r = defaults(model)
    year, region, lk = year or y, region or r, Lookups()
    resp = lk.get(q.comps(model, year, new=year > TODAY.year))
    comps = market.parse_comps(resp, model, year) if resp else []
    table = len(comps) < CFG["market"]["min_comps"]
    if not table:
        s = market.comp_summary(comps)
        value, low, high = s["median"], s["low"], s["high"]
    else:   # no comps: depreciation table at a typical mileage, with the configured band
        m, age = CFG["market"], max(TODAY.year - year, 0)
        value = round(finance.market_value(scenarios.base_msrp(model), age, age * m["expected_miles_per_year"], m["retention"],
                                           m["expected_miles_per_year"], m["per_mile_adjust"]))
        low, high = round(value * (1 - m["band"])), round(value * (1 + m["band"]))
    trend = market.parse_trend(lk.get(q.trends()) or {}, model)
    recalls = market.parse_recalls(lk.get(q.recalls(model)) or {}, model)
    reviews = market.review_summary(lk.get(q.youtube(model, year)) or {})
    found, _ = dealers(region, lk)
    return MarketQuote(model=model, year=year, estimated_value=value, low=low, high=high, comps=comps,
                       trend=Trend(**trend) if trend else None, recalls=[Recall(**x) for x in recalls],
                       reviews_summary=reviews,
                       dealers=found, as_of=lk.as_of, cached=lk.cached,
                       # the value's own source first: a table value must not read as SerpApi-sourced
                       source=", ".join(dict.fromkeys([CFG["market"]["source"], *lk.source.split(", ")])) if table
                       else lk.source)


@tool()
def get_market_value(args: MarketIn) -> MarketQuote:
    """Market value for a model-year from cached SerpApi comps (median, low, high), plus demand trend, recalls,
    the top YouTube review titles and nearby dealers. Source and as-of included."""
    return quote(args.model.value, args.year, args.region.value if args.region else None)


class DealerIn(BaseModel):
    region: Region
    limit: int = Field(3, ge=1, le=10)


@tool()
def find_dealer(args: DealerIn) -> dict:
    """Toyota dealers near the region's home city (Google Maps), best rated first, with recent review excerpts."""
    lk = Lookups()
    found, reviews = dealers(args.region.value, lk, args.limit)
    if not lk.rows:
        raise ToolError(f"No cached dealer data for {args.region.value}")
    return {"dealers": found, "top_dealer_reviews": reviews, "source": lk.source, "as_of": lk.as_of}


class RecallIn(BaseModel):
    model: Model


@tool()
def get_recalls(args: RecallIn) -> dict:
    """Recent recall news for a model (Google News headlines, not an official NHTSA VIN lookup)."""
    lk = Lookups()
    resp = lk.get(q.recalls(args.model.value))
    if resp is None:
        raise ToolError(f"No cached recall news for {args.model.value}")
    return {"recalls": [Recall(**x) for x in market.parse_recalls(resp, args.model.value)], "source": lk.source,
            "as_of": lk.as_of, "note": "News coverage; confirm by VIN at nhtsa.gov/recalls."}


@tool()
def estimate_payment(args: EstimateRequest) -> Estimate:
    """Walk-in estimate, no account needed: loan and lease payments, 5-year cost and CO2 for up to 3 new Toyotas at
    the real cached MSRP, with an optional trade-in valued from comps. Source and as-of included."""
    return estimate.estimate(args)
