# Toyota NXT: BUILD_PLAN

## 1. Repo structure
```
toyota-nextmove/
├── apps/console/            Next.js App Router, shadcn/ui, Tailwind, TanStack Table, Recharts, MSW
├── apps/customer/           Next.js PWA: app/app/* (phone), app/kiosk/* (kiosk), R3F showroom, MSW, i18n (en, es)
├── services/api/            FastAPI
│   ├── app/{main.py, routes/, models/ (Pydantic)}
│   ├── engine/              deterministic finance math + eligibility.yaml
│   ├── agents/              orchestrator, advisor, sentinel, hardship, market_intel, guardian
│   ├── tools/               12 tools + mcp_server.py
│   ├── serpapi/             wrappers + Supabase cache
│   ├── sim/                 generator + 24-month simulation
│   └── tests/
├── packages/contracts/      openapi.yaml, generated types.ts, mocks/ (JSON fixtures)
├── packages/tokens/         design tokens + SyntheticBadge
├── docs/                    SPEC.md, BUILD_PLAN.md, DECISIONS.md
├── pnpm-workspace.yaml, package.json, .env.example, .gitignore, README.md
```

## 2. Stages

### Stage 0 (B0 + C0 + K0 foundations)
- **Files:** workspace config; `openapi.yaml` (all SPEC §6 entities, §7 endpoints); mocks for Vishwaa, Sameera, Hung + 20 customers; MSW handlers in both apps; console shell (sidebar, role switcher, theme); customer `/app` + `/kiosk` shells (idle reset, privacy blur); tokens; FastAPI `/health` + Pydantic models; `.env.example`.
- **Libs:** pnpm, next, react, typescript, tailwind, shadcn/ui, msw, openapi-typescript, framer-motion, fastapi, uvicorn, pydantic, pytest.
- **Verify:** `pnpm dev` serves both apps from mocks; Vishwaa loads in `/app` and `/kiosk`; every console page renders mock data; `GET /health` returns 200.

### Backend
| Stage | Files | Libs | Verify |
|---|---|---|---|
| B1 | `sim/generator.py`, `engine/{keep,buyout,return,refi,tradein,extend,upgrade}.py`, `eligibility.yaml`, `POST /scenarios`, seed script | supabase-py, numpy | pytest on every formula; 3 personas return sensible numbers |
| B2 | `tools/*` (12), `mcp_server.py`, `serpapi/*`, cache table, `seed_cache.py`, `GET /market/{model}` | mcp, serpapi, httpx | each tool runs alone; demo passes with network off |
| B3 | `agents/*`, Guardian number-match check, autonomy enforcement, trace writer, `/agents/advisor/ask`, `/customers/{id}/recommendation`, `/opportunities`, `/traces`, `evals/` | anthropic | Vishwaa "lease end" Q&A produces trace + Guardian pass; evals green |
| B4 | `/customers/{id}/timing`, `/inspections` (vision), `/deal-packets`, true cost + CO2, NBA $ scoring | anthropic (vision) | real results for 3 personas |
| B5 | `sim/simulate.py`, `/kpis`, `/fairness`, `/audit`, `/offers*`, `/studio/*` + deploy gate (evals + injection tests) | pandas | console Proof and Responsible AI show real numbers |

### Console (all on mocks until C5)
| Stage | Build | Verify |
|---|---|---|
| C1 | Command Center, Opportunity Queue (TanStack), Customer 360 | find Vishwaa/Sameera/Hung and see why queued |
| C2 | NXT Review, Live Activity (Supabase realtime), handoff inbox, deal packets, L3 approvals | mock handoff appears live and can be claimed |
| C3 | Proof (sliders), Long-term Profit, Offer Studio, Market Intel | moving a slider updates every KPI |
| C4 | Trace panel, Responsible AI, Agent Studio | Recall Notifier deploys from template under 60s |
| C5 | MSW → real API per page behind a flag, skeletons, empty/error states, Cmd+K, synthetic banner | demo runs on live data with cache fallback |

### Customer (all on mocks until K5)
| Stage | Build | Libs | Verify |
|---|---|---|---|
| K1 | sign in (ID/QR/guest), My situation, My next move, Why this | gsap | each persona sees correct rec + explanation |
| K2 | what-if sliders, timing chart, cost + CO2, action center, handoff status | recharts | Sameera: recommendation → deal packet sent |
| K3 | photo pre-inspection, chat + voice (Web Speech, en/es), alerts inbox, hardship flow | none | Vishwaa gets estimate; Hung completes hardship |
| K4 | R3F showroom, exploded view, hotspots, trim/color, reviews | three, @react-three/fiber, drei | smooth on demo laptop |
| K5 | attract loop, QR continue, real API swap, perf + a11y | none | demo on live data with cache fallback |

## 3. Dependencies and parallelism
- Stage 0 blocks everything; contract frozen at its end.
- After Stage 0, B1→B5, C1→C4 and K1→K4 run in parallel on three worktrees. Frontends use mocks only.
- B2 needs B1 (engine). B3 needs B1+B2. B4 needs B3. B5 needs B1 (and B3 for traces/audit).
- C5 and K5 need B3 (and B4/B5 for their pages); swap page by page.
- Final integration after all lanes; demo freeze 3h before deadline.

## 4. Risks and fallbacks
| Risk | Fallback |
|---|---|
| SerpApi quota/network | pre-seeded Supabase cache; offline persona mode |
| LLM slow/down | pre-generated persona explanations (still Guardian-checked) |
| Contract churn after freeze | additive-only changes, logged in DECISIONS.md |
| Supabase realtime flaky | polling fallback on handoffs/traces |
| 3D model heavy / not explodable | stylized primitives model; drop exploded view first |
| Vision inspection unreliable | canned results for Vishwaa's photos, labelled estimate |
| Scope | cut orders in SPEC §9 |
| Live demo breaks | backup video |

## 5. Questions and defaults
1. Supabase project: provided by you? **Default:** you create it and fill `.env.local`; schema via SQL migration in `services/api/migrations`.
2. Python tooling: **Default:** `uv` + `pyproject.toml`.
3. Deploy targets: **Default:** Vercel (both apps), Render (API).
4. 3D asset: **Default:** primitives placeholder first; swap a CC GLB if time.
5. Auth: **Default:** none beyond persona ID/guest; console role switcher is client-side (enterprise RBAC is demo-grade).
6. Fuel/insurance/CO2 inputs: **Default:** documented synthetic constants in config.
7. Spanish scope: **Default:** all UI strings via i18n files; chat/voice in both.
8. Commits: **Default:** one per stage on lane branches; merge to `main` at integration.
