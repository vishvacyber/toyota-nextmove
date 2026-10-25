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

## API: agents (B3)
- `services/api/agents/`: Advisor and Hardship run on the Claude Agent SDK with the separate subscription login (`CLAUDE_CONFIG_DIR` in `.env.local`). The SDK is locked down: no built-in tools, no settings files, only the B2 tool registry (mounted in-process as an SDK MCP server). Orchestrator, Sentinel, Market Intel and Guardian are plain code.
- Guardian (`guardian.py`) checks every agent answer: every number must appear in that run's tool output, plus tone, consent, disclosures, fairness and prompt injection. A failed answer gets one send-back; after that, a pre-generated answer (`fallback.json`) or an engine template is served, marked in the trace.
- Endpoints: `POST /agents/advisor/ask`, `GET /customers/{id}/recommendation`, `GET /opportunities`, `GET /traces`, `GET /alerts`. Traces go to Supabase `traces` (`migrations/002_traces.sql`) and Realtime Broadcast channel `traces`, event `created`.
- Live persona evals (spend subscription quota; pytest never calls the SDK): `pnpm --filter @nextmove/api evals:live` (add `--save` to refresh `fallback.json`, or pass `CUST-…` IDs to rerun some).

## API: value features (B4)
- `GET /customers/{id}/timing`: month-by-month equity, fees and net position, best month, and act now vs wait 3 months in $. `POST /scenarios` also accepts `overrides.months_from_now`.
- `POST /inspections` (multipart `customer_id`, `photos[]`, `angles[]`): the vision model identifies wear items, and charges come from `[inspection.charges]` in `engine/config.toml`. Photos stay in memory. A canned Maria result is served if the SDK is down or slow.
- `POST /deal-packets` / `GET /deal-packets`: engine scenario + eligibility, sent to a cached dealer (in memory).
- `GET /opportunities`: `expected_value` and `retention_odds` come from `engine/nba.py` (weights in `[nba]`).

## API: proof + trust (B5)
- Also filled in from the contract: `GET /customers?q=`, `GET /customers/{id}`, `GET/POST /handoffs`, `PATCH /handoffs/{id}` (broadcasts `created`/`updated` on `handoffs`), `GET /sessions`, `POST /customers/{id}/recommendation/review`. `tests/test_contract_routes.py` fails if a contract operation has no route.
- `GET /kpis?adoption_rate=&outreach_lead_days=&hardship_uptake=`: 24-month baseline vs NextMove over all 1,200 customers (`sim/simulate.py`, coefficients in `[simulation]`). Deterministic, ~2 ms per call.
- `GET /fairness`: recommendation and offer rates by region and credit tier, flagged past `simulation.fairness_threshold`.
- `GET /audit`: `log_decision` entries (deal packets, alert approvals, Studio deploys) plus one entry per agent trace.
- `GET/POST /offers`, `POST /offers/{id}/simulate`: the offer and its `variant_of` A/B variants, scored with NBA odds and margins. `rule` is parsed (`days_to_maturity <= 90 AND powertrain = gas`) and limits the audience.
- `GET/POST /studio/agents`, `POST /studio/agents/{id}/deploy`: the deploy gate runs a tool-policy check, the persona evals (committed fallbacks + Guardian) and prompt-injection tests. It makes no SDK calls unless `STUDIO_GATE_LIVE=1`, which adds the 3 persona cases on the live model. A failed gate leaves the agent `failed`.

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

