"""Pre-seed the SerpApi cache for the 3 demo personas, then write serpapi/snapshot.json.

    pnpm --filter @nextmove/api seed:cache     (or: uv run --env-file ../../.env.local python -m scripts.seed_cache)

The only bulk SerpApi caller. Cache hits cost nothing, so re-running is free; it also re-syncs Supabase from the snapshot.
"""

import json

from engine.scenarios import TODAY
from serpapi import client, market
from serpapi import queries as q


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
        video = market.top_video(get(q.youtube(model, year))["response"])
        if video:
            get(q.transcript(video["id"]))
        top = market.parse_dealers(get(q.dealers(region))["response"], region)
        if top:
            get(q.dealer_reviews(top[0]["data_id"]))
    get(q.trends())

    synced = sum(client.db_put(row) for row in rows.values())
    client.SNAPSHOT.write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")   # exactly the keys the demo reads
    print(f"{len(rows)} cache rows, {client.calls} live SerpApi calls, {synced} rows synced to Supabase, "
          f"wrote {client.SNAPSHOT.name}")


if __name__ == "__main__":
    main()
