# CLAUDE.md — Toyota NextMove (HackTX)

You are building **Toyota NextMove**, a proactive, agentic financial co-pilot for Toyota Financial Services (TFS) customers. Full product and build spec: `docs/SPEC.md`. Stage prompts: `PROMPTS.md`.

## The one question
"Given my situation today, what's the smartest next move for me and my Toyota?"

## Two surfaces, one brain
- `apps/customer` — Customer App. Phone mode `/app/*`, Kiosk mode `/kiosk/*` (same screens, full-screen shell).
- `apps/console` — Employee Console (TFS / dealer staff).
- `services/api` — FastAPI: decision engine, agents, tools, SerpApi, simulation.
- `packages/contracts` — OpenAPI spec, generated TS types, mock fixtures. **Frozen after Stage 0.**
- `packages/tokens` — shared design tokens.

## Stack
- Console: Next.js (App Router) + TypeScript + shadcn/ui + Tailwind + TanStack Table + shadcn charts (Recharts) + Framer Motion.
- Customer App: Next.js PWA + TypeScript + Tailwind + Framer Motion + lucide icons; official Toyota imagery and logo from toyota.com (sponsor permission; Wikimedia fallback); Web Speech API for voice.
- API: Python 3.11+, FastAPI, Pydantic, pytest.
- Data + realtime + auth: Supabase (Postgres, Realtime). Channels: `sessions`, `handoffs`, `traces`, `alerts`, `calls`.
- LLM: **Gemini is primary** (`GEMINI_API_KEY`, REST, same tool registry); the **Claude Agent SDK** (`claude-agent-sdk`, Python) on a separate Claude Pro login (`CLAUDE_CONFIG_DIR`) is the backup, through `agents/llm.py`. Tools come from the B2 registry as an in-process SDK MCP server. AI-native: every customer-facing explanation is written live by the model, Guardian-checked and cached (Supabase); there are no pre-written answers. When nothing checked is ready, the API answers 503 and the app retries. Claude's default model is Haiku-class for speed (`NEXTMOVE_MODEL`); Gemini's is `GEMINI_MODEL`. Voice calls use **Gemini Live** (`GEMINI_LIVE_MODEL`, `agents/live.py`): the Guardian checks each spoken turn as it ends and the agent self-corrects (DECISIONS). Guardian stays deterministic code run on every agent output.
- Mocks: MSW in both frontends, fed by `packages/contracts/mocks`.
- Package manager: pnpm workspaces.

## Non-negotiable rules
1. **The engine computes every number. The LLM only explains engine output.** Never let the LLM produce a payment, cost, equity, fee, or rate.
2. **Guardian check** runs before any agent output reaches a customer: every number must exist in tool output; block otherwise. Live voice is checked per spoken turn as it ends, with self-correction (team decision, DECISIONS).
3. **Autonomy levels:** L1 read/analyze = auto; L2 draft = auto + visible in console; L3 customer-facing action = consent or employee approval; L4 money/credit decision = never an agent.
4. **No protected attributes** (race, sex, age, religion, national origin, etc.) anywhere in data or engine.
5. **Generated data only, never real customer data.** By team decision there is no "Synthetic data" badge or demo label on screen (the demo accounts are the team's own: Vishwaa, Sameera, Hung); estimates are still labelled as estimates.
6. **PII masking:** send customer IDs, not names, to the LLM. Mask PII in logs.
7. **Never commit secrets.** Keys live in `.env.local` / `.env` (gitignored). Read via env vars only.
8. **Mock first:** frontends work fully on MSW mocks before the API exists. Do not change `packages/contracts` after Stage 0 without saying so explicitly.
9. **Cache all SerpApi calls** in Supabase with timestamps; demo personas must work offline from cache.
10. Every market number shows source + "as of" time.

## Demo personas (must always work)
- **Vishwaa** — lease ends in 90 days, over on miles → buyout beats return; photo pre-inspection.
- **Sameera** — loan, positive equity → timing optimizer, hybrid upgrade, true cost + CO2, showroom, deal packet.
- **Hung** — missed payment after job change → hardship path, paycheck-aligned due date, human callback.

## How to work
- Work one stage at a time (see `PROMPTS.md`). Start in plan mode, propose a plan, then implement.
- Each stage has a "Done when" check in `docs/SPEC.md`. Verify it before saying the stage is done.
- Run lint, typecheck, and tests before finishing a stage. Fix failures.
- Keep commits small, one per stage: `stage(C1): command center, queue, customer 360`.
- Commits and PRs are authored by Vishva only: no `Co-Authored-By` trailer and no "Generated with Claude" line.
- If something is ambiguous, pick the simplest option that satisfies the spec and note it in `docs/DECISIONS.md`.

## Look and feel
- toyota.com look: Toyota logo, Helvetica Neue, rectangular 8px-radius buttons, Toyota red as the single accent, otherwise black and white. No emojis (lucide icons). Dark-first console, premium light/dark customer app.
- Console: dense, data-heavy, KPI cards, tables, charts.
- Customer App: large type, generous spacing, smooth motion. Kiosk touch targets ≥ 64 px and a 60s idle reset. Numbers are always visible (generated data; the privacy blur was removed by decision).
- English + Spanish strings from day one (`i18n` files).
- Accessible: contrast, focus states, screen-reader labels.
