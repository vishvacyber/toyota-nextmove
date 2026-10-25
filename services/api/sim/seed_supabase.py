"""One-shot: upsert the synthetic customers into Supabase.

    uv run python -m sim.seed_supabase

Needs SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment, and this table (run once in the SQL editor):

    create table if not exists customers (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    );

Safe to re-run: rows are upserted by id with the same deterministic data.
"""

import json
import os
import sys
import urllib.request
from datetime import UTC, datetime

from sim.generator import generate

BATCH = 500


def main() -> None:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.")
    now = datetime.now(UTC).isoformat()
    rows = [{"id": c.id, "data": c.model_dump(mode="json"), "updated_at": now} for c in generate()]
    for i in range(0, len(rows), BATCH):
        req = urllib.request.Request(
            f"{url.rstrip('/')}/rest/v1/customers?on_conflict=id", data=json.dumps(rows[i:i + BATCH]).encode(), method="POST",
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal"})
        with urllib.request.urlopen(req) as res:   # raises HTTPError on any non-2xx, stopping the run
            print(f"upserted {min(i + BATCH, len(rows))}/{len(rows)} (HTTP {res.status})")


if __name__ == "__main__":
    main()
