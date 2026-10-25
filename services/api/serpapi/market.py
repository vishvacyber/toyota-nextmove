"""Parse cached SerpApi responses into contract shapes. Pure functions: no engine imports, no I/O."""

import json
import math
import re
import statistics
import unicodedata

from serpapi.queries import CITY

PRICE = r"\$(\d{1,3},\d{3})"
# Phrases that state a market price for the whole model-year (listing-site averages, resale values, MSRP).
PRICE_PHRASES = [re.compile(rf"average[^$.;]{{0,90}}?{PRICE}", re.IGNORECASE), re.compile(rf"resale value of {PRICE}", re.IGNORECASE),
                 re.compile(rf"(?:msrp|starts at)[^$.;]{{0,20}}?{PRICE}", re.IGNORECASE)]
MIN_PRICE, MAX_PRICE = 5_000, 150_000
MIN_DEALER_REVIEWS = 100


def parse_comps(resp: dict, model: str, year: int) -> list[dict]:
    """One Comp per organic result that names this model-year and states a price."""
    out, seen = [], set()
    for r in resp.get("organic_results", []):
        text = f"{r.get('title', '')} {r.get('snippet', '')}"
        if model.lower() not in text.lower() or str(year) not in text or r.get("link") in seen:
            continue
        price = next((float(m.group(1).replace(",", "")) for p in PRICE_PHRASES if (m := p.search(r.get("snippet", "")))), None)
        if price is None:
            ext = {**(r.get("rich_snippet", {}).get("top", {}).get("detected_extensions") or {}),
                   **(r.get("rich_snippet", {}).get("bottom", {}).get("detected_extensions") or {})}
            price = ext.get("price")
        if price and MIN_PRICE <= price <= MAX_PRICE:
            seen.add(r["link"])
            out.append({"title": r.get("title", ""), "price": price, "miles": None, "source_url": r["link"]})
    return out


PRICE = r"\$\s?(\d{2,3},?\d{3})(?!\d)"
LIST_NEXT = re.compile(r"[.,;]?\s*\$\s?\d")
DEALER_PRICE = re.compile(r"dealer price|your price|you pay|for sale|only \$|mi away", re.IGNORECASE)   # a listing, not MSRP
STARTS_AT = re.compile(r"(?:msrp|starts? at|starting (?:msrp|price|at)|base price)[^$]{0,40}" + PRICE, re.IGNORECASE)


def parse_msrp(resp: dict, trim: str, base: bool = False, model: str = "", low: int = 15_000,
               high: int = 150_000) -> dict | None:
    """The trim's MSRP from search snippets: a price stated right after the trim name wins (e.g. "Camry SE suggested
    price: $32,618"); for a base trim, "MSRP starts at $29,700" also counts. toyota.com breaks ties. A cut-off
    multi-trim price list never counts, since its first number may belong to another trim."""
    by_trim = re.compile(rf"\b{re.escape(trim)}\b(?![- ]?(?:hybrid|plus|premium|nightshade))[^$\n]{{0,45}}" + PRICE, re.IGNORECASE)
    best = None
    other_model = re.compile(rf"grand[ -]?{re.escape(model)}", re.IGNORECASE) if model else None
    for r in resp.get("organic_results", []):
        text = " ".join([r.get("title", ""), r.get("snippet", ""), json.dumps(r.get("rich_snippet", {}))])
        link = r.get("link", "")
        if "inventory" in link or (other_model and other_model.search(link + " " + text)):
            continue   # a dealer's specific car (options, markup) or a different model (Grand Highlander) isn't MSRP
        for score, rx in ((3, by_trim), (2, STARTS_AT if base else None)):
            m = rx.search(text) if rx else None
            if m and (LIST_NEXT.match(text, m.end()) or DEALER_PRICE.search(text, m.start(), m.end() + 20)):
                m = None   # a cut-off list of several trims ("$36,425. $34,725"), or a dealer's asking price
            price = int(m.group(1).replace(",", "")) if m else 0
            if low <= price <= high:
                cand = (score + (0.5 if "toyota.com" in r.get("link", "") else 0),
                        {"price": price, "source_url": r.get("link", ""), "title": r.get("title", "")})
                if best is None or cand[0] > best[0]:
                    best = cand
                break
    return best[1] if best else None


def comp_summary(comps: list[dict]) -> dict:
    prices = [c["price"] for c in comps]
    return {"median": statistics.median(prices), "low": min(prices), "high": max(prices), "n": len(prices)}


def videos(resp: dict, n: int = 3) -> list[dict]:
    out = []
    for v in resp.get("video_results", []):
        if re.search(r"v=([\w-]{11})", v.get("link", "")) and len(out) < n:
            out.append({"title": v.get("title", ""), "channel": (v.get("channel") or {}).get("name") or "", "link": v["link"]})
    return out


def clean_title(title: str) -> str:
    """Readable video title: no emoji or symbols, single spaces, no trailing separators."""
    text = "".join(ch for ch in title if unicodedata.category(ch) not in ("So", "Sk", "Cf", "Co", "Cs"))   # drop emoji
    return re.sub(r"\s+", " ", text).strip(" |-–:!")


def review_summary(resp: dict) -> str | None:
    """What reviewers say, from the cached YouTube search: the top review titles and their channels (their own
    words, not a generated summary)."""
    vids = [v for v in videos(resp) if clean_title(v["title"])]
    if not vids:
        return None
    return "Top YouTube reviews: " + "; ".join(
        f'"{clean_title(v["title"])}"' + (f' ({v["channel"]})' if v["channel"] else "") for v in vids) + "."


def _miles_between(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lng2 - lng1)
    return 3958.8 * math.acos(min(1, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl)))


def parse_dealers(resp: dict, region: str) -> list[dict]:
    """Toyota dealers with 100+ reviews, best rated first, with distance from the region's home city.
    Keeps data_id for the reviews lookup (drop it before returning a contract Dealer)."""
    _, lat, lng = CITY[region]
    out = []
    for r in resp.get("local_results", []):
        if "toyota" not in r.get("title", "").lower() or not r.get("data_id") or (r.get("reviews") or 0) < MIN_DEALER_REVIEWS:
            continue
        gps = r.get("gps_coordinates") or {}
        dist = round(_miles_between(lat, lng, gps["latitude"], gps["longitude"]), 1) if gps else None
        out.append({"id": r.get("place_id") or r["data_id"], "data_id": r["data_id"], "name": r["title"],
                    "address": r.get("address", ""), "rating": r.get("rating"), "review_count": r.get("reviews"),
                    "distance_mi": dist})
    return sorted(out, key=lambda d: (-(d["rating"] or 0), d["distance_mi"] or 0))


def parse_reviews(resp: dict, n: int = 3) -> list[dict]:
    return [{"rating": r.get("rating"), "text": r["snippet"]} for r in resp.get("reviews", []) if r.get("snippet")][:n]


def parse_recalls(resp: dict, model: str, n: int = 5) -> list[dict]:
    """Recall headlines that name this model, newest first (Google News coverage, not an official NHTSA lookup)."""
    hits = [r for r in resp.get("news_results", [])
            if "recall" in r.get("title", "").lower() and model.lower() in r.get("title", "").lower() and r.get("iso_date")]
    hits.sort(key=lambda r: r["iso_date"], reverse=True)
    return [{"title": r["title"], "date": r["iso_date"][:10], "source_url": r["link"]} for r in hits[:n]]


def parse_trend(resp: dict, model: str) -> dict | None:
    """12-month average interest (0-100, relative to the other compared models) and the last-quarter direction."""
    iot = resp.get("interest_over_time", {})
    query = f"Toyota {model}"
    avg = next((a["value"] for a in iot.get("averages", []) if a["query"] == query), None)
    series = [v["extracted_value"] for w in iot.get("timeline_data", []) if not w.get("partial_data")
              for v in w["values"] if v["query"] == query]
    if avg is None or len(series) < 26:
        return None
    recent, prior = statistics.mean(series[-13:]), statistics.mean(series[-26:-13])
    direction = "up" if recent > prior * 1.05 else "down" if recent < prior * 0.95 else "flat"
    return {"direction": direction, "demand_index": avg}
