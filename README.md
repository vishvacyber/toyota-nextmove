# Toyota NextMove

**A proactive, agentic financial co-pilot for Toyota Financial Services customers.** Built at HackTX.

> "Given my situation today, what's the smartest next move for me and my Toyota?"

## The problem

TFS customers decide too late: a lease ends, miles run over, a payment slips, and the right option is gone. The options are confusing, every question becomes a call, and payment stress is caught after the damage is done.

## What NextMove does

It watches each customer's situation, reaches out at the right moment, compares every eligible option with exact numbers, and guides them to **one clear next step**. Employees see the whole portfolio, the profit impact, and every AI decision.

| Persona | Situation | What NextMove shows (real engine output) |
| --- | --- | --- |
| **Maria** | Lease ends in 90 days, 9,800 miles over | Buyout keeps **$6,467** of equity vs **$3,200** in return fees. Photo pre-inspection estimates wear charges before the official inspection. |
| **James** | Loan with positive equity, high fuel spend | Hybrid upgrade: payment **$496 → $428/mo**, true monthly cost about **$845 → $685**, **1,718 kg less CO2/year**. Acting now is worth **$820** more than waiting 3 months. Explore it in 3D, then send a deal packet to the dealer. |
| **Priya** | Missed payment after a job change | Due date moved to the **17th** to match her payday. Deferral and extension are money decisions, so they go to a **human callback**, never an agent. |

**Two surfaces, one brain:** a Customer App (phone + dealership kiosk, English and Spanish, voice) and an Employee Console (portfolio, live activity, proof of value, responsible AI, Agent Studio).

## Architecture

```
Customer App (Next.js PWA)  ─┐                         ┌─ Supabase (Postgres cache, Realtime: handoffs, traces)
  /app phone · /kiosk        ├─►  FastAPI  ────────────┤
Employee Console (Next.js)  ─┘     │                    └─ SerpApi (comps, dealers, recalls, trends, reviews) → cached
                                   ├─ Deterministic finance engine  ← computes EVERY number
                                   ├─ 12 tools (one registry, exposed as an MCP server)
                                   ├─ Agents on the Claude Agent SDK: Advisor, Hardship, vision inspection
                                   │    + Orchestrator, Sentinel, Market Intel (code)
                                   ├─ Guardian: blocks any number not found in tool output
                                   └─ 24-month simulation over 1,200 synthetic customers
```

**Trust by design:**
- **The LLM never computes money.** The engine computes every payment, fee and equity figure; the model only explains them. The Guardian checks every answer against the tool outputs and blocks or rewrites anything that doesn't match.
- **Autonomy levels.** Reads run automatically; drafts are visible in the console; customer-facing actions need the customer's tap or an employee's approval; money and credit decisions are never made by an agent.
- **Responsible AI.** No protected attributes anywhere. A fairness report by region and credit tier, a full audit log with overrides, and a deploy gate that runs evals and prompt-injection tests before any new agent goes live.
- **Synthetic data only**, labelled on every screen. Customer IDs, not names, go to the model.

## Track coverage

| Requirement | How |
| --- | --- |
| Personalize · Simplify · Guide | Customer 360 → engine options with assumptions and "why not" → one recommended action |
| Value | Proof dashboard: 24-month baseline vs NextMove over 1,200 customers; retention **54.4% → 68.6%** at 60% adoption, live sliders |
| Working prototype | Both surfaces on one live API, realtime handoffs between them |
| Responsible AI | Guardian, autonomy levels, fairness report, audit + overrides, deploy gate |
| Reimagine CX | Proactive alerts, voice EN/ES, kiosk with privacy blur, photo pre-inspection, 3D showroom |
| Reusable agent platform | Agent Studio: templates, tool registry, guardrails, traces, evals. A Recall Notifier deploys from a template in ~12 s |
| Meaningful SerpApi use | Market value = median of cached comps (source + as-of on every number); dealers, recalls, trends and reviews drive real decisions |

## Try it

**Public demo (mock data, no setup):** [Customer App](https://toyota-nextmove-customer.vercel.app) ([kiosk](https://toyota-nextmove-customer.vercel.app/kiosk), [James on the phone app](https://toyota-nextmove-customer.vercel.app/app?id=CUST-JAMES)) · [Employee Console](https://toyota-nextmove-console.vercel.app). The hosted copies run on recorded mock data; the live engine, agents and realtime run on the demo laptop.

## Run it

Needs Node 20+, pnpm 10, and [uv](https://docs.astral.sh/uv/) (installs Python 3.12 itself).

```bash
pnpm install
cp .env.example .env.local      # add Supabase + SerpApi keys and CLAUDE_CONFIG_DIR
pnpm dev                        # customer :3000, console :3001, API :8000
```

| URL | What |
| --- | --- |
| http://localhost:3000/kiosk | Kiosk: tap the attract screen, pick a demo customer |
| http://localhost:3000/app?id=CUST-JAMES | Phone app, signed in as James |
| http://localhost:3001 | Employee Console |

The agents run on a Claude subscription login: run `claude` once with `CLAUDE_CONFIG_DIR` set and `/login`. Without it, the app serves pre-written, Guardian-checked answers for the three personas. `NEXTMOVE_OFFLINE=1` keeps SerpApi off and serves the committed cache. `NEXT_PUBLIC_API_MOCKING=enabled` runs both frontends on mock data with no API at all.

**Demo script (3 min):** Maria at the kiosk: photo estimate, buyout beats return, start buyout. James: comps show equity, timing says don't wait, hybrid lowers total cost, explore in 3D, send deal packet. Priya: due date to payday, human callback. Console: ask NextMove a question to see the live session and trace, the queue with $ values, the Proof sliders, the fairness report, and deploy a Recall Notifier.

---

## Developer reference

**Checks:** `pnpm typecheck && pnpm lint && pnpm test`. **Contract:** `packages/contracts/openapi.yaml` is the source of truth (29 operations; a test fails if the API is missing one). After editing it, `pnpm gen` regenerates the TS types and Pydantic models.

```
apps/console        Next.js + shadcn employee console
apps/customer       Next.js PWA: /app (phone), /kiosk (kiosk)
services/api        FastAPI: engine, tools, agents, SerpApi, simulation
packages/contracts  openapi.yaml, generated types, MSW mocks
packages/tokens     design tokens + synthetic-data badge
docs/               SPEC, BUILD_PLAN, DECISIONS
```

- **Engine** (`services/api/engine/`): `finance.py` formulas, `scenarios.py` option builders, `timing.py`, `nba.py`; rates, fees, eligibility and NBA weights in `config.toml` / `eligibility.toml`. 1,200 seeded customers from `sim/generator.py`.
- **Tools** (`services/api/tools/`): the 12 tools in one registry. Run one alone: `uv run python -m tools get_market_value '{"model":"RAV4"}'`. MCP server: `pnpm --filter @nextmove/api mcp`.
- **SerpApi cache** (`services/api/serpapi/`): Supabase `serpapi_cache` → committed `snapshot.json` → live only on a miss. Re-seed the personas: `pnpm --filter @nextmove/api seed:cache`.
- **Agents** (`services/api/agents/`): the SDK is locked down (no built-in tools or settings, only the tool registry). Live persona evals: `pnpm --filter @nextmove/api evals:live`. Traces go to Supabase `traces` and Realtime channel `traces`.
- **Supabase tables:** `services/api/migrations/` (run once in the SQL editor). Handoffs, deal packets, offers and Studio agents are kept in memory for the demo.
- **Decisions and trade-offs:** [docs/DECISIONS.md](docs/DECISIONS.md). Product spec: [docs/SPEC.md](docs/SPEC.md).

## Team

- Vishwaa Shah
- Vishva Patel
- Sameeraa K
- Hung
