# Decisions

Simplest option that satisfies the spec, per CLAUDE.md.

## Stage 0
- **Contract additions beyond SPEC §7** (needed by console/customer screens, added before the freeze): `GET /handoffs`, `GET /deal-packets`, `GET /alerts`, `PATCH /alerts/{id}`, `GET /sessions`, `POST /customers/{id}/recommendation/review`. Entities added: `Session`, `Opportunity`, `TimingPlan`, `FairnessReport`, `AuditEntry`, `StudioAgent`, `DeployResult`, `Dealer`.
- **Customer embeds vehicle + contract.** One contract per customer keeps the persona flows simple.
- **Advisor answers are JSON, not a stream.** K3 can animate the text client-side; SSE can be added later as a new endpoint without breaking the contract.
- **Pydantic models are generated** from `openapi.yaml` (`pnpm gen`), so the API can't drift from the contract.
- **Mocks are TypeScript, not JSON**, so `tsc` checks every fixture against the generated types. One shared `handlers.ts` serves both apps.
- **Console pages render generically in Stage 0** from `lib/nav.ts` (title + endpoints). C1–C4 replace each with the real screen.
- **Kiosk idle reset** remounts the screen (re-blurring every number) and resets language to English. Sign-out comes with K1 sign-in.
- **Framer Motion / GSAP / R3F not installed yet**: added in the stage that first uses them (K1, K4).
- **Python 3.12 via uv**; Node 24, pnpm 10.

## Stage C1 (console)
- **Generic route is now `app/[...slug]`** (was optional catch-all) so `app/page.tsx` can own `/`; real routes (`/queue`, `/customers`, `/customers/[id]`) win over the catch-all.
- **TanStack Table v8**, not v9: v8 is the shadcn data-table pattern; v9's API differs.
- **Equity on Customer 360 comes from the recommendation's scenarios** (`Scenario.equity`); `Customer` has no equity field and the console computes no numbers.
- **Risk bands** (Low < 30%, Medium < 60%, High) are display-only thresholds on `risk_score`.
- **Queue filters** are situation, priority and a text search over name, ID, model and reason; the `/customers` page uses the API's `?q=` search.
- **Console strings are English-only for now**; console i18n comes with a later C stage.

## Stage C2 (console)
- **"Internal value" on NextMove Review is `Opportunity.expected_value`** (plus `retention_odds`) from `/opportunities`. The contract has no internal-margin field, so no contract change.
- **A reason is required for approve and override.** The contract only requires it on override; the stage prompt asks for a reason on every review, and it makes the audit trail complete.
- **The reviewer, claimer and alert actor is a fixed demo employee, `EMP-ADVISOR-1`** (`lib/employee.ts`, matches the audit fixtures). The header role switcher stays cosmetic.
- **Handoffs cross apps over Supabase Realtime Broadcast**: channel `handoffs`, event `created` (new contract `Handoff`) and `updated` (after claim/resolve), no tables. The inbox seeds from `GET /handoffs`, then upserts every event by id. The console subscribes with `broadcast.self: true` so the tab that sends an event updates the same way as every other tab.
- **Claim of a handoff from another browser falls back to a local claim on 404.** MSW stores live per browser, so a handoff broadcast by the customer app isn't in the console's mock store. Remove the fallback once the real API holds handoffs.
- **Realtime offline** (no keys, or the channel errors/closes): the inbox still works from the mock list and shows "Realtime offline · mock list only".
- **Env wiring:** `next.config.ts` loads the repo-root `.env.local` with `loadEnvConfig(root, …, forceReload=true)` (Next has already cached its own app-folder load, so without `forceReload` the call is a no-op) and maps only `SUPABASE_URL` / `SUPABASE_ANON_KEY` to `NEXT_PUBLIC_*`. The service key never reaches the browser.
- **Dev-only "Simulate customer handoff"** button on Live Activity broadcasts a `created` event, to prove the inbox before K2 lands.
- **Console unit tests use `node --test`** (Node 24 runs TypeScript directly), so no test runner was added.

## Stage K1 (customer app)
- **Signed-in customer lives in `?id=CUST-…`** on `/app` and `/kiosk`. That URL is also the QR deep link, so there's no auth state to store. Sign-out (and the kiosk's 60s idle reset) goes back to the bare path, which shows sign-in. IDs are upper-cased, and `CUST-` is added if it's missing.
- **No camera QR scanning** in K1: the phone's own camera opens the deep link. `BarcodeDetector` isn't available on desktop Safari or Firefox, so it would need a fallback anyway.
- **Demo persona buttons** (Maria, James, Priya) on sign-in, for the dealership demo. All data is synthetic.
- **The three steps (Situation → Next move → Why this) are client state**, not routes, so the kiosk remount resets them for free.
- **The recommendation action button isn't wired yet.** The action center is K2.
- **Engine copy (headline, labels, why, assumptions) stays English** until the Advisor returns localized text (B3). Everything in the UI around it is EN/ES.
- **Kiosk blur covers every dollar figure**, including the why text, why-not reasons and assumptions (each one is its own tap). APR and miles stay visible.
- **A Guardian `block` verdict hides the recommendation** and shows "a specialist is reviewing".

## Stage K2 (customer app)
- **"Decide + act" is a 4th step** after Why this, on both `/app` and `/kiosk`. The recommended card's button jumps to it.
- **What-if sliders** (down payment, term, miles/year) send only the overrides the customer moved, debounced 300 ms, to `POST /scenarios`. The mock returns fixed numbers until K5.
- **True cost + CO2** shows every scenario in the what-if result that has `true_cost`; no differences are computed client-side.
- **Claim offer and start self-service have no contract endpoint**, so for now they're confirm-then-acknowledge in the UI (no contract change). Offers are `GET /offers` filtered to `active` + the customer's situation; James has none.
- **Book follow-up = `POST /handoffs` with `callback_at`** (one of the next three weekdays at 10:00), broadcast like a talk request so it reaches the console queue.
- **Handoff realtime:** Supabase Broadcast on `handoffs`; we send `created` (full `Handoff`), listen for `updated` by id. The channel lives in `Flow`, so sign-out and the kiosk idle remount close it. No Supabase env or a failed subscribe → the handoff is still created and the banner says live updates are offline.
- **Env:** `next.config.ts` loads the repo-root env with `forceReload` (Next caches the app folder's env first) and maps only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Kiosk blur on the timing chart and true-cost columns is one tap per block**, labels included, rather than one tap per number.

## Stage B1
- **No Supabase yet.** The 1,200 synthetic customers are regenerated in memory on startup (deterministic, seed 42, ~0.3 s). `sim/seed_supabase.py` upserts them into a `customers (id, data jsonb)` table when keys exist; it hasn't been run.
- **Config is TOML, not YAML** (`engine/config.toml`, `engine/eligibility.toml`): it's in the standard library (`tomllib`), so no new dependency, and it's just as readable.
- **Fixed engine date** `2026-10-24T09:00Z` (same as the mocks' `AS_OF`), so results never drift between runs.
- **Market value** = MSRP × depreciation curve by age − $0.10/mile over a 12k/yr pace, labelled "NextMove depreciation table (synthetic, pre-SerpApi)" with an as-of date in every scenario. B2 replaces it with SerpApi comps.
- **Lease equity** = market value − residual (valued at lease end). Lease options exclude the remaining lease payments, which every option shares.
- **total_cost** = out-of-pocket over the option's horizon (payments + down payment + fees). Buyout/upgrade include financing interest.
- **Options modeled:** do_nothing, keep, buyout, return, refinance, trade_in, extend, upgrade, plus due_date_change and deferral for payment stress. `new_lease`, `pay_extra`, `pay_off` return "not modeled yet" when requested.
- **Formulas live in one `finance.py`**, not one file per option as BUILD_PLAN sketched; builders are in `scenarios.py`.
- **`months_from_now` override is ignored** until the B4 timing optimizer.
- **Upgrade default target** is the same model's electrified trim (Prius → bZ).
- **`keep` is listed only when requested**: for loans it equals the `do_nothing` baseline, and leases can't use it.
- **An existing late fee is added to every option** (it's already owed), so no option looks cheaper than it is.

## Stage B2
- **One registry for every consumer.** Each tool is a Python function taking one Pydantic input model. Its JSON schema feeds MCP (`tools/mcp_server.py`, low-level `mcp` Server over stdio). B3 mounts the same registry in the Claude Agent SDK in-process.
- **Market value comes from SerpApi comps.** A comp is a model-year market price taken from Google results: a listing site's average, a resale value, or an MSRP. The engine uses the median (needs ≥ 2), adjusted $0.10/mile against a 12k/yr pace, and falls back to the depreciation table otherwise. Persona results: Maria's equity is $6,467 (was $4,810), James's $11,942 (was $11,570), Priya's $20,949. Prius has only 2 comps. The engine reads the cache only and never calls live.
- **`GET /market` estimated_value is the model-year median** (typical miles); scenarios use the customer's mileage-adjusted value, so the two differ by the mileage adjustment.
- **Cache order:** Supabase → committed `serpapi/snapshot.json` → live. Live calls happen only on a miss, are capped at 10 per process, and are off with `NEXTMOVE_OFFLINE=1`. After a Supabase failure the cache skips Supabase for 60 s, so offline requests don't stall. Responses are slimmed before caching: no request metadata, no reviewer names, transcripts cut to 15 lines.
- **Recalls are Google News headlines** that name the model, not an NHTSA VIN lookup; the tool output says so.
- **Reviews summary is a quoted ~25-word excerpt** of the top YouTube review's transcript, not generated text.
- **Dealers:** each region has one synthetic home city (Austin, Los Angeles, Chicago, Boston). Results come from Google Maps "Toyota dealership" searches, keep dealers with 100+ reviews, and sort best rated first. Distance is measured from that city.
- **Action tools keep state in memory** (appointments, offer drafts, handoffs, audit) until B3 persists them. `book_appointment` is L3 and always `pending_approval`. `create_offer_draft` is L2 and always `draft`.
- **Minimal until B4:** `inspect_photos` returns no items and the config wear estimate, with a disclaimer saying photos weren't analysed. `get_timing` moves equity only with projected miles and the loan balance, and its summary is labelled "Preliminary".
- **`get_customer` masks name, email and phone** (rule 6).
- **SerpApi spend:** 30 live calls. 22 rows are seeded, 4 calls were redone after the first RAV4 comps query returned unrelated results, 3 were duplicates spent before the cache table existed, and 1 went on a verification.

## LLM access (before B3)
- **Agents run on the Claude Agent SDK with a separate Claude subscription login**, not a paid API key (the user can't buy API credits). Grok was considered as primary but dropped: the xAI team has no credits.
- **Setup:** the API server uses that account's login via `CLAUDE_CONFIG_DIR` (absolute path in `.env.local`), kept apart from the developer's own Claude login. One-time: run `claude` with `CLAUDE_CONFIG_DIR` set, then `/login`.
- **Consequences:** agents run only where that login exists (the demo laptop), so the agent API isn't deployed to Render/Railway. Subscription limits are rolling, so pre-generated, Guardian-checked persona answers are the required fallback. The engine still computes every number; the Guardian check is unchanged.

## Stage B3
- **Only Advisor and Hardship call the LLM.** The Orchestrator (routing, session context), Sentinel (scan of 1,200 customers, ranking, outreach drafts) and Market Intel (cache refresh, recall flags) are deterministic code. Market Intel runs only by hand (`python -m agents.market_intel`), never at API startup: its first run over all 6 models missed the cache for Tacoma, Highlander and bZ and spent 9 live SerpApi calls (now cached in Supabase). One LLM call per customer per scan would drain the subscription, and the engine supplies every number anyway. Each one still writes an `AgentTrace` (`model: "deterministic"`).
- **SDK lockdown:** `tools=[]`, `allowed_tools` = that agent's `mcp__nextmove__*` tools, `permission_mode="dontAsk"`, `setting_sources=[]`, `strict_mcp_config`, no plugins, an empty temporary `cwd`, and `ANTHROPIC_API_KEY` blanked. A run also refuses to continue if the SDK's init message lists any non-registry tool. The customer's message is wrapped as data, and known injection patterns never reach the model.
- **Guardian tolerance:** a number in the text matches a tool value exactly, within $0.51 (cents rounded to dollars), or as that value rounded to 10, 100 or 1,000 and within 1% ("about $28,900" for 28,917). A percent matches the value or ×100. Numbers in the customer's own message and small counts 0–10 are allowed. Numbers written inside tool strings count as tool output (e.g. "the 17th", "$22,450 residual"). An earlier flat 0.5% tolerance let 2024 match 2026, so it was replaced.
- **`numbers_used` labels come from the tool output, not the model's text.** The best match wins: exact before rounded, a named field before a number inside a sentence, then tool order. A field is labelled by its name ("Monthly payment"); a number found only in a sentence is labelled by that sentence. Small counts like "$0 down" are left out of `numbers_used`. An ordinal ("the 17th", "el 17", "día 17") is treated as a day of the month: it prefers a `*_day` field, then the sentence that states it ("Move due date to the 17th"), never an unrelated field with the same value (Priya's horizon is also 17 months).
- **Verdicts:** an unmatched number, a protected attribute or a prompt injection → `block`. Tone, consent claims or a missing disclosure → `revise`. Either way the model gets one send-back with the reason, then the fallback is served. The estimate disclosure and the market source + as-of line are appended by code, not left to the model.
- **The recommended option comes from fixed rules** (`agents/recommend.py`): a per-situation preference list, first eligible option wins, and buyout only with positive equity. `why` is the cached, Guardian-checked live text for Maria and Priya. James's live `why` failed the Guardian, so he gets the engine template (re-checked on every request; template whenever the cached text no longer passes).
- **Autonomy:** `agents/autonomy.gate`. An L3 tool call (book_appointment) leaves the action `pending_approval`, and an agent name never counts as an approver. Hardship always hands off to a human in code (`handoff_to_human`, L4, `escalated`) and broadcasts it on `handoffs` / `created`, so C2/K2 inboxes see it.
- **Opportunity `expected_value` / `retention_odds` are flat config placeholders** (`[opportunity]` in `engine/config.toml`) until B4's NBA scoring.
- **Alerts, sessions and action-tool state stay in memory.** Only traces persist.
- **`PATCH /alerts/{id}`** (console approvals, customer consent): 404 for an unknown id. Approval needs an employee actor (an agent name gets 409). Any alert becomes `sent` only from `approved` (409 otherwise), so outreach never reaches a customer without a human. 409 isn't listed in the contract; the success shape is unchanged.
- **Spanish:** each persona fallback has a hand-translated `answer_es` with exactly the same numbers (a test checks this and Guardian-checks each one). It's served when `language` is `es`. The disclosure, the market source line, the safe replies and the Guardian's tone and consent checks are bilingual. Non-persona template fallbacks and the recommendation `why` stay English. `evals.live --save` rewrites persona entries without `answer_es`, and the fallback test then fails until they're re-translated.
- **`market.min_comps` is 3** (was 2): Priya's Prius had only 2 listings ($28,589), so it now uses the depreciation table, $24,050 with source + as-of. Her equity is $16,410 (was $20,949); her payments, totals and fees are unchanged. Maria ($6,467 equity, buyout beats return) and James ($428.31 hybrid vs $496 payment) are unchanged.
- **Engine comps load in one Supabase query per engine** (`client.cached_only`, read once per process) instead of one lookup per model-year. The first request after startup went from 5.5 s to 0.65 s.
- **PII:** the model gets the customer ID only (`get_customer` already masks names). Emails, phones, SSNs and card numbers are masked out of the customer's message before the model and the logs.

