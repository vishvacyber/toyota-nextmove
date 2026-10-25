"""Pre-seed the SerpApi cache for the 3 demo personas, then write serpapi/snapshot.json.

    pnpm --filter @nextmove/api seed:cache     (or: uv run --env-file ../../.env.local python -m scripts.seed_cache)

The only bulk SerpApi caller. Cache hits cost nothing, so re-running is free; it also re-syncs Supabase from the snapshot.
"""

import json

from app.models import Model
from engine import scenarios
from engine.scenarios import TODAY
from serpapi import client, market
from serpapi import queries as q
from tools.market import defaults


def main() -> None:
    client.MAX_LIVE_CALLS = 40
    rows: dict[str, dict] = {}

    def get(req: tuple[str, dict]) -> dict:
        row = client.search(*req)
        rows[row["key"]] = {k: v for k, v in row.items() if k != "cached"}
        return row

    for model, year, region in q.PERSONA_VEHICLES:
        get(q.comps(model, year, new=year > TODAY.year))
        get(q.recalls(model))
        get(q.youtube(model, year))   # review titles + channels; transcripts are no longer used
        top = market.parse_dealers(get(q.dealers(region))["response"], region)
        if top:
            get(q.dealer_reviews(top[0]["data_id"]))
    for m in [m.value for m in Model if m.value not in {v[0] for v in q.PERSONA_VEHICLES}]:
        get(q.youtube(m, defaults(m)[0]))   # showroom "what reviewers say" for the non-persona models
    get(q.trends())
    for m in [m.value for m in Model]:   # real MSRPs: each model's base trim (today) and its upgrade trim (next year)
        get(q.msrp(m, scenarios.CFG["market"]["base_trim"][m], TODAY.year))
        cat = scenarios.CFG["catalog"][m]
        get(q.msrp(m, cat.get("msrp_trim", cat["trim"]), TODAY.year + 1))

    synced = sum(client.db_put(row) for row in rows.values())
    client.SNAPSHOT.write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")   # exactly the keys the demo reads
    print(f"{len(rows)} cache rows, {client.calls} live SerpApi calls, {synced} rows synced to Supabase, "
          f"wrote {client.SNAPSHOT.name}")


if __name__ == "__main__":
    main()
