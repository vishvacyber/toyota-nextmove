# PROMPTS.md — paste these into Claude Code (VS Code), one stage at a time

**How to use**
- Start every stage in **plan mode**. Review the plan, then approve.
- One stage per chat session. Commit after each stage.
- Parallel option: 3 VS Code windows on 3 git worktrees (backend, console, customer). Run Stage 0 first on `main`, then branch.

```
git worktree add ../nm-backend -b lane/backend
git worktree add ../nm-console -b lane/console
git worktree add ../nm-customer -b lane/customer
```

---

## 00 — Plan the whole build (run first, plan mode)
```
Read CLAUDE.md and docs/SPEC.md fully. Do not write code yet.
Produce docs/BUILD_PLAN.md with:
1. Repo and folder structure you will create.
2. For each stage (B0–B5, C0–C5, K0–K5): files to create, libraries to install, and how you'll verify its "Done when".
3. Dependencies between stages and what can run in parallel.
4. Risks and the simplest fallback for each.
5. Any questions or ambiguities, with your default answer.
Keep it concise. Then stop and wait for my approval.
```

## Stage 0 — Contract + scaffolding (everyone waits for this)
```
Implement Stage 0 from docs/SPEC.md (B0 + C0 + K0 foundations):
- pnpm monorepo: apps/console, apps/customer, services/api, packages/contracts, packages/tokens.
- packages/contracts/openapi.yaml covering every entity and endpoint in SPEC §6–7; generate TS types (openapi-typescript).
- Mock fixtures for Maria, James, Priya + 20 extra customers in packages/contracts/mocks.
- MSW wired in both Next.js apps serving those mocks for every endpoint.
- FastAPI skeleton with health route and Pydantic models matching the contract.
- Shared tokens (Toyota red accent, neutrals, type scale), synthetic-data badge component.
- .env.example for ANTHROPIC_API_KEY, SERPAPI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY. .gitignore for envs.
- README with run commands.
Done when: `pnpm dev` runs both apps on mocks and the API health check passes.
```

---

## Backend lane

### B1 — Data + engine
```
Implement B1: synthetic generator (1,000+ customers, leases + loans across Camry, RAV4, Tacoma, Highlander, Prius, bZ; no protected attributes) seeded into Supabase; deterministic finance engine for keep, buyout, return, refinance, trade-in, extend, upgrade (monthly payment, total cost, equity, fees, assumptions); eligibility rules as readable config. POST /scenarios. Pytest unit tests for every formula. Done when tests pass and personas return sensible numbers.
```

### B2 — Tools + SerpApi
```
Implement B2: each tool in SPEC §4 as a function and exposed via an MCP server. SerpApi wrappers (Google Search + Extract for comps, Maps + Maps Reviews for dealers, News for recalls, Trends for demand, YouTube transcript for reviews) with Supabase cache (timestamp, source). Script to pre-seed cache for the 3 personas. GET /market/{model}. Done when each tool runs alone and demo works with network disabled.
```

### B3 — Agents
```
Implement B3: Orchestrator, Advisor, Sentinel, Hardship, Market Intel, Guardian using Claude tool use. Guardian blocks any number not present in tool output. Autonomy levels enforced. Every run writes AgentTrace to Supabase `traces` channel. POST /agents/advisor/ask, GET /customers/{id}/recommendation, GET /opportunities, GET /traces. Add eval cases for the 3 personas. Done when Advisor answers "What should I do at lease end?" for Maria end to end with a trace and Guardian pass.
```

### B4 — Value features
```
Implement B4: GET /customers/{id}/timing (month-by-month optimizer), POST /inspections (vision model on photos → items + estimated charges, clearly labelled estimate), POST /deal-packets, true cost + CO2 in scenarios, next-best-action $ scoring for opportunities. Done when all return real results for the 3 personas.
```

### B5 — Proof + trust
```
Implement B5: 24-month simulation baseline vs. NextMove over all customers with adjustable assumptions; GET /kpis; GET /fairness (recommendation/offer rates by region and credit tier, flag gaps); GET /audit; offers + /offers/{id}/simulate with A/B; Agent Studio endpoints with deploy gate (eval cases + prompt-injection tests). Done when console Proof and Responsible AI pages can show real numbers.
```

---

## Console lane (shadcn/ui)

### C1 — Core portfolio
```
Implement C1 in apps/console using shadcn/ui: Command Center (KPI cards, maturity pipeline 90/60/30, trend charts), Opportunity Queue (TanStack table: next-best-action, $ value, retention odds, script, filters), Customer 360 (profile, contract, equity, risk, timeline, current recommendation). Mocks only. Done when an advisor can find Maria, James, Priya and see why each is queued.
```

### C2 — Act + connect
```
Implement C2: NextMove Review (customer's options + internal margin, approve/override with reason), Live Activity (Supabase realtime sessions + handoff inbox with claim), Deal packets view, Alert approvals (L3). Done when a mock handoff appears live and can be claimed.
```

### C3 — Prove value
```
Implement C3: Proof dashboard (baseline vs NextMove, assumption sliders, KPI deltas), Long-term Profit (LTV, loyalty revenue, cost-to-serve saved), Offer Studio (rules, simulate, A/B), Market Intel (values, trends, recalls with source + as-of). Done when moving a slider updates every KPI.
```

### C4 — Trust + agents
```
Implement C4: Agent trace panel (live timeline: plan, tool calls, Guardian verdict, action; drill-in), Responsible AI (fairness report, audit table, overrides, model/prompt versions), Agent Studio (agent health, template picker, tool attach, deploy gate results). Done when a Recall Notifier can be deployed from a template in under 60 seconds.
```

### C5 — Integrate + polish
```
Implement C5: swap MSW for the real API page by page (keep mocks behind a flag), skeletons, empty/error states, toasts, Cmd+K command menu, synthetic-data banner. Run the console part of the demo script twice. Done when it runs on live data with cache fallback.
```

---

## Customer App lane

### K1 — Core flow
```
Implement K1 in apps/customer (shared by /app and /kiosk): sign in by ID / QR / guest, My situation, My next move (recommendation + 2–3 alternatives side by side), Why this (explanation, assumptions, why-not). Premium automotive design, Framer Motion transitions. Done when each persona sees a correct recommendation.
```

### K2 — Decide + act
```
Implement K2: what-if sliders (live recalculation via /scenarios), best-time-to-move chart, true cost + CO2 comparison, action center (self-service start, book follow-up, claim offer, send deal packet), talk-to-a-person handoff with live status. Done when James goes from recommendation to deal packet sent.
```

### K3 — AI experiences
```
Implement K3: photo pre-inspection (guided camera capture of 6 angles, upload, results with marked items + estimated charges labelled as estimate), Advisor chat + voice (Web Speech API, English and Spanish, streams answers with numbers used), alerts inbox with consent controls, hardship flow for Priya. Done when Maria gets an estimate and Priya completes hardship.
```

### K4 — 3D Showroom
```
Implement K4: React Three Fiber + drei showroom: 360° orbit, studio lighting, exploded-view slider (body, powertrain, battery, chassis, interior move along set vectors), feature hotspots with cards, trim/color switch with price, "what reviewers say" from /market. Use a CC-licensed GLB in public/models (or a stylized placeholder built from primitives), compressed under ~5 MB, lazy-loaded. Done when it runs smoothly on the demo laptop.
```

### K5 — Kiosk polish + integrate
```
Implement K5: attract loop (cinematic car + "Tap to see your next move"), 60s idle reset, privacy blur, QR continue-on-phone, swap mocks for real API persona by persona, performance and accessibility pass. Run the customer part of the demo twice. Done when it runs on live data with cache fallback.
```

---

## Final — Integration + demo
```
Merge all lanes to main. Run the full demo script in docs/SPEC.md §11 end to end. List and fix every break. Deploy console + customer app to Vercel and API to Render/Railway. Write a 1-page README for judges (problem, architecture, how to run, track coverage). Then stop for demo freeze.
```
