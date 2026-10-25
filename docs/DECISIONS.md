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
- **One registry, two providers.** Each tool is a Python function taking one Pydantic input model. Its JSON schema feeds Grok (`openai_tools()`) and MCP (`tools/mcp_server.py`, low-level `mcp` Server over stdio). B3 can mount the same registry in the Claude Agent SDK in-process.
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
- **Provider chain: Grok (xAI API) → Claude Agent SDK → pre-generated answers.** The user can't buy Claude API credits. Grok is primary because it's a plain key and deployable. The Claude Agent SDK on a separate Claude Pro account is the fallback when Grok fails or is rate-limited. Agents call one provider function; each provider implements the same tool-calling contract, and the same evals run against both.
- **Claude fallback setup:** The API server uses that account's login via `CLAUDE_CONFIG_DIR=~/.claude-nextmove`, kept apart from the developer's own Claude login. One-time setup: `CLAUDE_CONFIG_DIR=~/.claude-nextmove claude`, then `/login` with the Pro account.
- **Consequences:** the Claude fallback runs only where that login exists (the demo laptop); a deployed API has Grok plus the pre-generated answers. Pro has rolling usage limits, so pre-generated, Guardian-checked persona answers are the required fallback, not optional. The engine still computes every number; the Guardian check is unchanged.
