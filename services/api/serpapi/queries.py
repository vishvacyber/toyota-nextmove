"""Every SerpApi request the app makes, as (engine, params). Shared by runtime lookups and the seed script,
so the seed fills exactly the cache keys the app reads."""

# Dealer searches are centred on one synthetic home city per region.
CITY = {"South": ("Austin, TX", 30.2672, -97.7431), "West": ("Los Angeles, CA", 34.0522, -118.2437),
        "Midwest": ("Chicago, IL", 41.8781, -87.6298), "Northeast": ("Boston, MA", 42.3601, -71.0589)}
TREND_MODELS = ["RAV4", "Camry", "Prius", "Tacoma", "Highlander"]   # Google Trends compares at most 5 terms


# The 3 demo personas' cars, plus Sameera's Camry Hybrid upgrade target (Camry is hybrid-only from 2025).
PERSONA_VEHICLES = [("RAV4", 2024, "South"), ("Camry", 2022, "West"), ("Camry", 2027, "West"), ("Prius", 2023, "Midwest")]


def comps(model: str, year: int, new: bool = False) -> tuple[str, dict]:
    q = f"{year} Toyota {model} for sale price" if new else f"{year} Toyota {model} used price"
    return "google", {"q": q, "gl": "us", "hl": "en", "num": 20}


def msrp(model: str, trim: str, year: int) -> tuple[str, dict]:
    """Real Toyota sticker price (MSRP) for one model + trim; parsed by serpapi.market.parse_msrp."""
    return "google", {"q": f"{year} Toyota {model} {trim} MSRP", "gl": "us", "hl": "en", "num": 10}


def dealers(region: str) -> tuple[str, dict]:
    _, lat, lng = CITY[region]
    return "google_maps", {"q": "Toyota dealership", "ll": f"@{lat},{lng},11z", "type": "search", "hl": "en"}


def dealer_reviews(data_id: str) -> tuple[str, dict]:
    return "google_maps_reviews", {"data_id": data_id, "hl": "en", "sort_by": "newestFirst"}


def recalls(model: str) -> tuple[str, dict]:
    return "google_news", {"q": f"Toyota {model} recall", "gl": "us", "hl": "en"}


def trends() -> tuple[str, dict]:
    return "google_trends", {"q": ",".join(f"Toyota {m}" for m in TREND_MODELS), "data_type": "TIMESERIES",
                             "date": "today 12-m", "geo": "US"}


def youtube(model: str, year: int) -> tuple[str, dict]:
    return "youtube", {"search_query": f"{year} Toyota {model} review"}


