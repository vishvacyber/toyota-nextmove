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
