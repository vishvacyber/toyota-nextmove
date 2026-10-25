# Toyota NextMove

A proactive, agentic financial co-pilot for Toyota Financial Services customers (HackTX).
It answers one question: "Given my situation today, what's the smartest next move for me and my Toyota?"

- Customer App (phone + kiosk) and Employee Console, backed by one FastAPI decision engine.
- The engine computes every number; the LLM only explains. A Guardian agent checks outputs before customers see them.
- Synthetic data only.

Product spec: [docs/SPEC.md](docs/SPEC.md) · Build plan: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) · Build rules: [CLAUDE.md](CLAUDE.md) · Stage prompts: [PROMPTS.md](PROMPTS.md)

## Run

Needs Node 20+, pnpm 10, and [uv](https://docs.astral.sh/uv/) (installs Python 3.12 itself).

```bash
pnpm install
cp .env.example .env.local      # fill in keys when the API needs them
pnpm dev                        # customer :3000, console :3001, API :8000
```

| URL | What |
| --- | --- |
| http://localhost:3000/app | Customer App, phone mode |
| http://localhost:3000/kiosk | Customer App, kiosk mode |
| http://localhost:3001 | Employee Console |
| http://localhost:8000/health | API health check |

Frontends run on MSW mocks by default (`NEXT_PUBLIC_API_MOCKING=enabled`).

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
```

## API: data + engine

- `services/api/engine/`: `finance.py` (pure formulas), `scenarios.py` (option builders), `config.toml` (rates, fees, depreciation table, driving costs), `eligibility.toml` (readable rules).
- `services/api/sim/generator.py`: 1,200 deterministic synthetic customers (seed 42), including `CUST-MARIA`, `CUST-JAMES`, `CUST-PRIYA`. Regenerated in memory when the API starts.
- `POST /scenarios` with `{"customer_id": "CUST-JAMES"}` returns every eligible option plus the `do_nothing` baseline.

Seed Supabase (one-shot, optional; create the `customers` table first, SQL is in the script's docstring):

```bash
cd services/api && SUPABASE_URL=... SUPABASE_SERVICE_KEY=... uv run python -m sim.seed_supabase
```

## API: tools + SerpApi (B2)

- `services/api/tools/`: the 12 SPEC §4 tools in one registry (`registry.py`): JSON schema from each Pydantic input, `openai_tools()` for Grok, and an MCP server (`mcp_server.py`) for Claude. Run one alone: `uv run python -m tools` (list) or `uv run python -m tools get_market_value '{"model":"RAV4"}'`.
- `services/api/serpapi/`: cached SerpApi lookups. Order: Supabase `serpapi_cache` → committed `snapshot.json` → live (only on a miss, max 10 per process, never when `NEXTMOVE_OFFLINE=1`). Market value in every scenario comes from cached comps (source + as-of in the assumptions), with the depreciation table as fallback.
- `GET /market/{model}?year=` returns a `MarketQuote`.
- `pnpm dev` runs from the snapshot (works offline). `pnpm --filter @nextmove/api dev:live` loads `.env.local` to use Supabase and live SerpApi.
- Cache table: `services/api/migrations/001_serpapi_cache.sql`. Re-seed the 3 personas (cache hits are free): `pnpm --filter @nextmove/api seed:cache`.

## Contract

`packages/contracts/openapi.yaml` is the source of truth. After editing it, run `pnpm gen` to regenerate the TS types and the API's Pydantic models.

## Layout

```
apps/console        Next.js + shadcn employee console
apps/customer       Next.js PWA: /app (phone), /kiosk (kiosk)
services/api        FastAPI: engine, agents, tools, SerpApi, simulation
packages/contracts  openapi.yaml, generated types, MSW mocks
packages/tokens     design tokens + synthetic-data badge
docs/               SPEC, BUILD_PLAN, DECISIONS
```
##Team
Vishwaa Shah
Vishva Patel
Sameeraa K
Hung

