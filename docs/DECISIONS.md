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

## Stage C3 (console)
- **Proof sliders send all three assumptions** (`adoption_rate`, `outreach_lead_days`, `hardship_uptake`) to `GET /kpis`, debounced 300 ms. The mock handler only scales NextMove with adoption, so lead time and hardship uptake are echoed but don't move numbers until the B5 simulation; the page says so under the sliders.
- **KPI deltas are a display subtraction** (`nextmove − baseline`, rates shown in percentage points). The console computes no new money numbers. The KPI list moved to `lib/kpis.ts` so Command Center and Proof share it.
- **Proof keeps the last snapshot on screen** while a new `/kpis` request loads (`useApi` blanks data on path change), so cards don't flicker while dragging.
- **Long-term Profit reads the default `/kpis`** (LTV, `loyalty_revenue`, cost to serve). "Saved" is baseline minus NextMove cost to serve.
- **A/B variants are offers with `variant_of`**: listed under their parent; "Simulate" runs only on parent offers (the endpoint returns parent + variants). New offers are drafts and are kept in page state plus the per-browser MSW store, so they disappear on reload until the real API lands.
- **"Leader" on a simulation** is the variant with the highest API `expected_profit`; a comparison, not a calculation.
- **Market Intel fetches all six models** (one `/market/{model}` each). Each card's footer shows the quote's `source` and `as_of`; comps and recalls link to their `source_url`.

## Stage C4 (console)
- **Traces are live over Supabase Realtime Broadcast**: channel `traces`, event `created`, payload a full contract `AgentTrace` (as B3 sends). The C2 seed + subscribe logic is now a shared `useRealtimeList` (`lib/realtime.ts`), used by both the handoff inbox and the trace panel; items are de-duplicated by `id` (`upsertById`).
- **Trace drill-in is an in-page selection**, not a `/traces/{id}` route: the contract has no single-trace endpoint, and live traces only exist in the list.
- **The customer filter calls `GET /traces?customer_id=`** and also filters live events on the page, since the channel carries every customer's traces.
- **L4 actions always display as "Escalated to human"**, whatever `action.status` says (`actionStatus` in `lib/trust.ts`). A Guardian `block` gets a red border and a "Blocked by Guardian" badge.
- **Dev-only "Simulate trace" / "Simulate blocked trace"** broadcast a synthetic Recall Notifier trace on `traces`, to prove the panel before the console uses the real API (C5). No seeded trace is a block, so the second button shows that state.
- **Studio template tool presets** (SPEC §4 tool names): Recall Notifier = get_customer, get_recalls, find_dealer, book_appointment, log_decision; Lease-end Nudge = get_customer, run_scenario, get_market_value, get_timing, log_decision; Rate-drop Alert = get_customer, run_scenario, check_eligibility, create_offer_draft, log_decision; Custom = none. All are editable before create.
- **Studio agents created or deployed are kept in page state** over the fetched list (same as C3 offers); the status after deploy comes from `DeployResult.passed`. The "Template to deployed in X s" readout is a display-only stopwatch for the < 60 s check.
- **Model and prompt versions** are the distinct `(agent, model, prompt_version)` triples from `GET /traces`, plus each Studio agent's `prompt_version`; `fallback:` models get a Fallback badge.
- **Fairness highlights only the API's `flagged` groups**; the console computes no gap itself.

## Stage K1 (customer app)
- **Signed-in customer lives in `?id=CUST-…`** on `/app` and `/kiosk`. That URL is also the QR deep link, so there's no auth state to store. Sign-out (and the kiosk's 60s idle reset) goes back to the bare path, which shows sign-in. IDs are upper-cased, and `CUST-` is added if it's missing.
- **No camera QR scanning** in K1: the phone's own camera opens the deep link. `BarcodeDetector` isn't available on desktop Safari or Firefox, so it would need a fallback anyway.
- **Demo persona buttons** (Vishwaa, Sameera, Hung) on sign-in, for the dealership demo. All data is synthetic.
- **The three steps (Situation → Next move → Why this) are client state**, not routes, so the kiosk remount resets them for free.
- **The recommendation action button isn't wired yet.** The action center is K2.
- **Engine copy (headline, labels, why, assumptions) stays English** until the Advisor returns localized text (B3). Everything in the UI around it is EN/ES.
- **Kiosk blur covers every dollar figure**, including the why text, why-not reasons and assumptions (each one is its own tap). APR and miles stay visible.
- **A Guardian `block` verdict hides the recommendation** and shows "a specialist is reviewing".

## Stage K2 (customer app)
- **"Decide + act" is a 4th step** after Why this, on both `/app` and `/kiosk`. The recommended card's button jumps to it.
- **What-if sliders** (down payment, term, miles/year) send only the overrides the customer moved, debounced 300 ms, to `POST /scenarios`. The mock returns fixed numbers until K5.
- **True cost + CO2** shows every scenario in the what-if result that has `true_cost`; no differences are computed client-side.
- **Claim offer and start self-service have no contract endpoint**, so for now they're confirm-then-acknowledge in the UI (no contract change). Offers are `GET /offers` filtered to `active` + the customer's situation; Sameera has none.
- **Book follow-up = `POST /handoffs` with `callback_at`** (one of the next three weekdays at 10:00), broadcast like a talk request so it reaches the console queue.
- **Handoff realtime:** Supabase Broadcast on `handoffs`; we send `created` (full `Handoff`), listen for `updated` by id. The channel lives in `Flow`, so sign-out and the kiosk idle remount close it. No Supabase env or a failed subscribe → the handoff is still created and the banner says live updates are offline.
- **Env:** `next.config.ts` loads the repo-root env with `forceReload` (Next caches the app folder's env first) and maps only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Kiosk blur on the timing chart and true-cost columns is one tap per block**, labels included, rather than one tap per number.

## Stage K3 (customer app)
- **Placement:** the alerts inbox is in step 1 (Situation), and step 4 (Decide + act) opens with the hardship card for `payment_stress` and the photo pre-inspection for leases. Advisor chat is a new step 5, "Ask NextMove". All of it is shared by `/app` and `/kiosk`.
- **Customers see only `sent` / `approved` alerts.** L3 drafts awaiting employee approval never reach them. In the mocks Vishwaa's alert is still `pending_approval`, so Sameera is the persona with a visible alert. Consent and dismiss are `PATCH /alerts/{id}` with the customer ID as `actor`.
- **Accepting the due-date change is UI-only** (confirm-then-acknowledge, like K2's self-service): the contract has no endpoint for it. The callback handoff reason records whether it was accepted.
- **Extension is treated like deferral (L4):** it changes credit terms, so neither has an accept button. Both go to a specialist through "Request a callback" (K2's follow-up booking: `POST /handoffs` with `callback_at`, broadcast `created`).
- **`numbers_used` values are shown with `num()`, not `money()`:** the contract value has no unit, so the frontend guesses no `$`. They're blurred in the kiosk anyway.
- **The Advisor answer is revealed client-side**, word by word (the API returns JSON). A hidden `aria-live` node announces the full answer once.
- **Voice:** recognition via `SpeechRecognition ?? webkitSpeechRecognition`, and speech via `speechSynthesis`, both in `en-US`/`es-US` following the app language. "Read answers aloud" is off by default, so kiosk numbers aren't spoken unprompted. While speaking, a caption bar shows the spoken text. With no recognition API, the mic is hidden and a note says to type.
- **Photos stay in memory only:** blobs are sent once in the multipart upload, then dropped. The object URLs used for the marked-up preview are revoked on unmount. The kiosk idle remount stops the camera and drops the photos, and the reset also cancels `speechSynthesis` (it's global).
- **The mock inspection returns fixed Vishwaa items whatever the photos** (B4 brings vision). Items whose angle has no photo are still listed without a picture.
- **Customer app tests use `node --test`** like the console (`lib/box.test.ts`).
- Dev server ran on 3120: 3100 was held by another lane.

## Stage K4 (customer app)
- **Model:** a stylized car built from primitives (boxes, cylinders, rounded boxes). There's no GLB, so nothing to download or license, and it explodes by construction. The UI shows no attribution because there's nothing to attribute.
- **Entry:** any next-move card whose scenario has a `target_vehicle` gets "Explore in 3D" (Sameera's Camry SE Hybrid upgrade). It opens a native modal `<dialog>` over the flow rather than a new route, so `/app` and `/kiosk` share it. Esc or Close returns focus to the button. The kiosk idle remount unmounts it, and R3F's unmount disposes the renderer and forces WebGL context loss.
- **Price = the engine's scenario monthly payment.** The current car is priced by `keep` and each target vehicle by its scenario. A trim with no scenario says "Price not available". No trims are invented. Colors are cosmetic and labeled as not changing the estimate. Kiosk prices use `<Private>`.
- **Hotspots are plain DOM buttons over the canvas**, projected from 3D anchors in `useFrame`. drei `<Html>` (a React root per hotspot) left one hotspot empty and threw "synchronously unmount a root" errors under React 19.
- **Frame loop:** `always` only while auto-rotating, `demand` otherwise (renders only on change), and `never` when offscreen or the tab is hidden. DPR is capped at 1.5. Auto-rotate is off under `prefers-reduced-motion` and stops on first drag.
- **Studio light** uses drei `Lightformer`s inside `<Environment>`, not a preset HDR, so it needs no network fetch.
- **Cut line:** the exploded view is just the `explode` prop + `offset()` in `lib/showroom.ts`. Removing the slider leaves the parts at rest.
- Measured: the 3D code is one lazy chunk of ~1.0 MB raw / ~274 KB gzip, loaded only when the showroom opens. It holds 120 fps (display refresh) during auto-rotate in Chrome on the dev laptop. `THREE.Clock` logs a deprecation warning from inside R3F 9.8 with three 0.186. It's harmless.
- Dev server ran on 3104.

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
- **Market value comes from SerpApi comps.** A comp is a model-year market price taken from Google results: a listing site's average, a resale value, or an MSRP. The engine uses the median (needs ≥ 2), adjusted $0.10/mile against a 12k/yr pace, and falls back to the depreciation table otherwise. Persona results: Vishwaa's equity is $6,467 (was $4,810), Sameera's $11,942 (was $11,570), Hung's $20,949. Prius has only 2 comps. The engine reads the cache only and never calls live.
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
- **Consequences:** agents run only where that login exists (the demo laptop), so the agent API isn't deployed to Render/Railway. Subscription limits are rolling; see "AI-native, no pre-written answers" below for how that's handled. The engine still computes every number; the Guardian check is unchanged.

## Stage B3
- **Only Advisor and Hardship call the LLM.** The Orchestrator (routing, session context), Sentinel (scan of 1,200 customers, ranking, outreach drafts) and Market Intel (cache refresh, recall flags) are deterministic code. Market Intel runs only by hand (`python -m agents.market_intel`), never at API startup: its first run over all 6 models missed the cache for Tacoma, Highlander and bZ and spent 9 live SerpApi calls (now cached in Supabase). One LLM call per customer per scan would drain the subscription, and the engine supplies every number anyway. Each one still writes an `AgentTrace` (`model: "deterministic"`).
- **SDK lockdown:** `tools=[]`, `allowed_tools` = that agent's `mcp__nextmove__*` tools, `permission_mode="dontAsk"`, `setting_sources=[]`, `strict_mcp_config`, no plugins, an empty temporary `cwd`, and `ANTHROPIC_API_KEY` blanked. A run also refuses to continue if the SDK's init message lists any non-registry tool. The customer's message is wrapped as data, and known injection patterns never reach the model.
- **Guardian tolerance:** a number in the text matches a tool value exactly, within $0.51 (cents rounded to dollars), or as that value rounded to 10, 100 or 1,000 and within 1% ("about $28,900" for 28,917). A percent matches the value or ×100. Numbers in the customer's own message and small counts 0–10 are allowed. Numbers written inside tool strings count as tool output (e.g. "the 17th", "$22,450 residual"). An earlier flat 0.5% tolerance let 2024 match 2026, so it was replaced.
- **`numbers_used` labels come from the tool output, not the model's text.** The best match wins: exact before rounded, a named field before a number inside a sentence, then tool order. A field is labelled by its name ("Monthly payment"); a number found only in a sentence is labelled by that sentence. Small counts like "$0 down" are left out of `numbers_used`. An ordinal ("the 17th", "el 17", "día 17") is treated as a day of the month: it prefers a `*_day` field, then the sentence that states it ("Move due date to the 17th"), never an unrelated field with the same value (Hung's horizon is also 17 months).
- **Verdicts:** an unmatched number, a protected attribute or a prompt injection → `block`. Tone, consent claims or a missing disclosure → `revise`. Either way the model gets one send-back with the reason, then the fallback is served. The estimate disclosure and the market source + as-of line are appended by code, not left to the model.
- **The recommended option comes from fixed rules** (`agents/recommend.py`): a per-situation preference list, first eligible option wins, and buyout only with positive equity. `why` is the cached, Guardian-checked live text for Vishwaa and Hung. Sameera's live `why` failed the Guardian, so he gets the engine template (re-checked on every request; template whenever the cached text no longer passes).
- **Autonomy:** `agents/autonomy.gate`. An L3 tool call (book_appointment) leaves the action `pending_approval`, and an agent name never counts as an approver. Hardship always hands off to a human in code (`handoff_to_human`, L4, `escalated`) and broadcasts it on `handoffs` / `created`, so C2/K2 inboxes see it.
- **Opportunity `expected_value` / `retention_odds` are flat config placeholders** (`[opportunity]` in `engine/config.toml`) until B4's NBA scoring.
- **Alerts, sessions and action-tool state stay in memory.** Only traces persist.
- **`PATCH /alerts/{id}`** (console approvals, customer consent): 404 for an unknown id. Approval needs an employee actor (an agent name gets 409). Any alert becomes `sent` only from `approved` (409 otherwise), so outreach never reaches a customer without a human. 409 isn't listed in the contract; the success shape is unchanged.
- **Spanish:** each persona fallback has a hand-translated `answer_es` with exactly the same numbers (a test checks this and Guardian-checks each one). It's served when `language` is `es`. The disclosure, the market source line, the safe replies and the Guardian's tone and consent checks are bilingual. Non-persona template fallbacks and the recommendation `why` stay English. `evals.live --save` rewrites persona entries without `answer_es`, and the fallback test then fails until they're re-translated.
- **`market.min_comps` is 3** (was 2): Hung's Prius had only 2 listings ($28,589), so it now uses the depreciation table, $24,050 with source + as-of. The equity is $16,410 (was $20,949); the payments, totals and fees are unchanged. Vishwaa ($6,467 equity, buyout beats return) and Sameera ($428.31 hybrid vs $496 payment) are unchanged.
- **Engine comps load in one Supabase query per engine** (`client.cached_only`, read once per process) instead of one lookup per model-year. The first request after startup went from 5.5 s to 0.65 s.
- **PII:** the model gets the customer ID only (`get_customer` already masks names). Emails, phones, SSNs and card numbers are masked out of the customer's message before the model and the logs.


## Stage B4
- **Timing optimizer** (`engine/timing.py`): for months 0–6, `net_position = equity − fees added by waiting − payments made by then` (loans only). On a loan the principal comes back as equity, so waiting costs depreciation + interest. Lease payments before maturity are shared by every option and left out; past maturity the extra miles go over the allowance. A past-due account adds a late fee for each month it stays unresolved. Time depreciation takes this year's drop on the retention curve, pro-rated by month. Persona results for act now vs wait 3 months: Vishwaa +$721, Sameera +$820, Hung +$841. Best month is now for all three.
- **`months_from_now`** projects the customer forward (`scenarios.advance`: miles, payments, loan payoff) and values the car that many months ahead. The offset sits in a ContextVar (`scenarios.ahead`) so the builders don't each need a new parameter. Allowed range: 0–24.
- **True cost + CO2** is on every option where the customer keeps driving: lease extend, due-date change and deferral are new. Return, trade-in and lease do-nothing have no car going forward, so they have none. Upgrade lists the CO2 saved per year (Sameera: 1,718 kg).
- **Inspection vision** runs on the Claude Agent SDK, locked down like B3 with zero tools and `max_turns=1`. Images go as base64 content blocks in one streamed user message, with a 25 s timeout. The model only names angle, area (from a config list), position, issue, severity and a box. **Charges come from `[inspection.charges]`**, keyed by area and severity. Any output that mentions money, or has an unknown key, area, severity or a bad box, is rejected whole.
  - Fallback: canned items from config for Vishwaa (front bumper $150, rear-left door $250, wheel $0 = $400, matching the K3 mock), or the standard $400 estimate with no items for anyone else, each with its own disclaimer.
  - Each run writes an `inspector` trace without the photos. Photos are read into memory and never stored or logged. Only the result is kept, in memory, and the latest total replaces the flat $400 wear estimate in the return option.
  - Upload limits: 1–6 photos, JPEG/PNG/WebP, 5 MB each, angles default to front, rear, left, right, interior, wheels.
  - The `inspect_photos` tool now takes only `customer_id` and returns the latest result, because the model can't upload photos.
- **Deal packets are kept in memory** (`tools.actions.STORE`), not in Supabase, to keep the demo simple: no table and no migration. The packet holds the engine scenario for the option, readable passed-rule lines from `eligibility.toml`, and a dealer from the cached Google Maps search only, so it never spends SerpApi quota. Northeast has no cached dealers and gets 404. Pressing "Send" in the app is the customer's L3 consent, so status is `sent`, plus a `log_decision` audit entry. An ineligible option gets 422.
- **NBA $ scoring** (`engine/nba.py`, weights in `[nba]`, replacing the `[opportunity]` placeholders):
  - `retention_odds = logistic(situation intercept + equity + on-time payment share + days past due + option)`, clamped to 0.05–0.95.
  - `expected_value = odds × 6% margin × payment × horizon`, plus `payoff × cure lift × 45% loss-given-default` (credit loss avoided) for customers in payment stress. Options with no payment use a config flat value.
  - No protected attributes, no credit tier, no region.
  - Persona results: Vishwaa buyout $1,428 at 0.89, Sameera upgrade $1,391 at 0.90, Hung due-date change $1,215 at 0.74.
  - `reason` and `script` still use only engine numbers and pass the Guardian.
- **`python-multipart`** is now a direct dependency (it was already in the lock through `mcp`).
- **Live spend:** 2 SDK vision calls (7.9 s direct, 7.5 s over HTTP) and 0 SerpApi calls.

## Before Stage 5 (shared)
- **Per-path mock switch:** `NEXT_PUBLIC_API_MOCKING` takes `enabled`, `disabled`, or a comma list of path prefixes that stay mocked (`activeHandlers()` in `packages/contracts/mocks/handlers.ts`). This lets C5/K5 move pages to the real API one at a time. A prefix covers its sub-paths (`/customers` also mocks `/customers/{id}/timing`). This changes mock infrastructure only, not the frozen contract.
- **CORS** allows any `localhost` / `127.0.0.1` port in dev, so parallel lane servers can reach the API. Real origins get listed when the frontends deploy.

## Stage B5
- **Simulation** (`sim/simulate.py`, coefficients in `[simulation]`, each with its rationale). It uses expected values, not random draws, so the same assumptions always give the same KPIs. Each customer's recommended option, retention odds, margin and cure lift come from `recommend.pick` and B4's `nba.score`. The simulation adds only the horizon math:
  - Each customer has one stay-or-leave decision: at maturity if it falls within 24 months, otherwise at a per-situation month.
  - Reach = `1 − exp(−lead_days / 60)`.
  - NextMove stay = `baseline + adoption × reach × max(0, nba_odds − baseline)`.
  - Delinquency for stressed accounts × `1 − hardship_uptake × cure_lift`.
  - Inbound calls are deflected by adoption × reach and by hardship uptake.
  - Revenue = margin on current payments up to the decision, plus loyalty revenue (stay × NBA margin of the next contract), minus credit losses (roll × payoff × loss-given-default).
  - Hardship uptake applies independently of adoption, since it's its own slider. At adoption 0 and uptake 0, NextMove retention and delinquency equal the baseline. Cost to serve still includes outreach touches.
  - Per-customer rows are computed once per process (~0.1 s, warmed at startup), so `GET /kpis` is arithmetic over 1,200 rows: about 2 ms over HTTP.
  - Defaults (adoption 0.6, lead 90 days, uptake 0.5): retention 54.5% → 68.6%, delinquency 4.49% → 4.04%, calls per 100 customers 184.9 → 147.6, revenue $531,612 → $781,016. Revenue here is TFS margin, not gross payments, so it is smaller than the mock's.
- **Fairness** uses region and credit tier only. A group is flagged when its recommendation or offer rate is more than 5 points off its dimension's overall rate. Currently nothing is flagged. Offer rates are low (1–4%) because the only active offers target lease-end customers. `GET /fairness` has no `threshold` query parameter because the contract has none; the threshold lives in config.
- **Offers** stay in memory (`tools.actions.STORE`). They're seeded with the mock's lease-end A/B pair (0.5% rate cut vs $500 cash, both active) and a draft hybrid credit, retargeted from `ev_switch` to `positive_equity` because no synthetic customer is in `ev_switch`.
  - POST reuses the `create_offer_draft` tool (status draft). An unknown `variant_of` gets a 404, which the contract doesn't list.
  - **The `rule` text is parsed and applied** (`simulate.parse_rule`). A rule is clauses joined by `AND`: a situation name or `field op value` (`<= >= < > = !=`). Fields are engine facts plus situation, model and powertrain only. There is no region, credit tier or protected attribute, so an offer can't target a group (rule 4). An unreadable rule, `OR`, an unknown field, or `<`/`>` on text gets a 422 on `POST /offers`. `target_situation` still applies too. A/B variants are scored on the parent offer's audience. The hybrid credit now targets 159 gas-powered positive-equity customers (was 363).
  - A rate reduction is valued as the engine's payment difference on the payoff over the recommended option's horizon.
  - Acceptance = `logistic(logit(nba_odds) + 0.6 × incentive / $1,000)`, and profit = Σ acceptance × (NBA margin − incentive).
  - Seed result: the rate cut gives 90.9% acceptance and $28,781 profit; the cash offer gives 91.8% and $24,894.
- **Audit** = `log_decision` entries plus one derived entry per trace (from Supabase, or from memory when offline). New `log_decision` calls: alert status changes (`PATCH /alerts`) and every Studio deploy (actor `guardian`, L2). Nothing new is persisted, so no migration.
- **Agent Studio** stays in memory, seeded with Advisor, Hardship and Sentinel as deployed. Health counts traces from the last 24 hours (up to 1,000, from Supabase or memory).
  - The deploy gate has 4 evals: tool policy (at least one tool, all from the registry, none L4) plus the 3 persona cases. Each persona case Guardian-checks the committed fallback and confirms the engine still recommends the case's option.
  - It also runs 6 injection tests: 4 hostile messages must be caught by `guardian.injected` and blocked, and a leaked tool name and an invented number must be blocked.
  - By default it never calls the SDK. **`STUDIO_GATE_LIVE=1`** (an env var, because the contract has no parameter for it) adds the 3 persona cases on the real model, run in parallel (3 subscription calls). They call `sdk.run` directly with the orchestrator's routing, prompt and disclosures, and check the Guardian, routing and tool calls. Like `orchestrator.ask`, a draft that isn't a Guardian pass (revise or block) gets one send-back with the Guardian's reasons. Each failing check is named in `detail`, per attempt ("Guardian revise (attempt 1): tone: …"), and a failed case keeps the model's answer text in `detail`. First real run, before the send-back existed: Vishwaa and Hung passed live; Sameera got `revise`, so the gate refused to deploy. They skip `orchestrator.ask`, so a gate run writes no trace and creates no hardship handoff in the console inbox. If the SDK is unavailable, the gate fails.
  - Recall Notifier (with the console template's tools) passes in about 7 ms. A custom agent with no tools or an unknown tool fails and stays `failed`.
- **Contract gaps filled** (7 operations no stage had built; the frontends kept them mocked). All are in memory, and none is a new table:
  - `GET /customers?q=` does a case-insensitive substring match on the id or full name over the 1,200 synthetic customers. `GET /customers/{id}` returns 404 for an unknown id.
  - `GET /handoffs` lists newest first. `POST /handoffs` reuses the `handoff_to_human` tool and broadcasts `created` on `handoffs`. `PATCH /handoffs/{id}` broadcasts `updated`; both broadcasts carry the full contract `Handoff`. Claiming needs `claimed_by` (422). An unknown id gets a 404. The customer app also broadcasts its own `created`; the console upserts by id, so the duplicate is harmless.
  - `GET /sessions`: the orchestrator records a contract `Session` for each `session_id` it sees: customer, surface, first-seen time, language and last trace, with `current_screen: "advisor"`. It's newest first and isn't broadcast.
  - `POST /customers/{id}/recommendation/review` writes an `AuditEntry` through `log_decision` (`approve_recommendation` / `override_recommendation`, L3, with `override_reason` and the recommendation's trace). It also sets `Recommendation.review`. An override without a reason gets a 422, and an agent name as reviewer gets a 409. A review never changes the engine's recommended option or its numbers. `log_decision` gained an optional `override_reason`.
  - `tests/test_contract_routes.py` checks that every method + path in `openapi.yaml` has a FastAPI route, so a missing endpoint fails the build.
- **`MarketQuote.reviews_summary`** now lists the top 3 YouTube review titles and their channels from the cached search: `Top YouTube reviews: "…" (CarGurus); …`. Emoji are stripped. The transcript excerpt it replaces read poorly. Source and as-of stay on the quote. Transcripts are no longer read or seeded (`scripts/seed_cache.py`), so the same data needs one fewer SerpApi call. Cached transcript rows are left in place, unused.
- **Market `source` names the value's own source first.** When there are fewer than `min_comps` comps, `estimated_value` comes from the depreciation table, so `source` now starts with "NextMove depreciation table (synthetic)" before the SerpApi engines the quote also read (trends, dealers, reviews). Prius 2023 (2 comps), Tacoma, Highlander and bZ show the table; RAV4 and Camry show SerpApi Google Search. Values are unchanged.
- **Offline snapshot covers every model's review search.** `seed_cache` also seeds the YouTube review search for Tacoma, Highlander and bZ (2024), so their showroom "what reviewers say" works offline. Those rows were already in Supabase from Market Intel, so the run made **0 live SerpApi calls**. The rewritten snapshot drops the 4 unused transcript rows; the other rows changed only in timestamp formatting. bZ has no Google Trends term, so its `trend` stays empty.
- **`GET /opportunities` doesn't write traces** (0 new traces over repeated calls; the scan is cached). The extra Sentinel traces in the console come from API restarts: each start (and every `--reload`) reruns the startup scan, which rebuilds the in-memory alert drafts and writes one trace. That's kept as designed.
- **Live checks (2026-10-25):**
  - A test handoff for CUST-00001 was created, claimed by `EMP-B5-CHECK` and resolved on port 8105. Supabase accepted the `created` and both `updated` broadcasts (`traces.broadcast` returned True, no warnings).
  - The live deploy gate (`STUDIO_GATE_LIVE=1`) passed all 13 checks in 6.5 s with 3 SDK calls. Sameera passed on the first draft, with no send-back.

## C5 — console on the real API
- **Live by default:** after B5, the console runs with `NEXT_PUBLIC_API_MOCKING=disabled`. MSW stays for offline use.
- **Exact-path mocks (console only):** the console runs its own MSW provider (`apps/console/components/mock-provider.tsx`) with the shared `NEXT_PUBLIC_API_MOCKING` syntax plus a trailing `$` for an exact path (`lib/mocking.ts`), e.g. `/customers$` mocks the list without the live `/customers/{id}/recommendation`. Sections served by mocks show a **"Mock data"** badge (`MockBadge`); with mocking disabled the badge never renders.
- **Approvals** lists `draft` and `pending_approval` alerts: the real Sentinel leaves its L2 outreach as `draft`, and both need a person before reaching a customer.
- Toasts and the Cmd+K menu are small in-house components (no `sonner` / `cmdk` dependency).

## K5 (customer: attract loop, QR continue, real API)
- **Fully live:** the customer app runs with `NEXT_PUBLIC_API_MOCKING=disabled` against the merged API, which now serves every contract operation. The shared MSW path (`enabled`, or a prefix list) still works offline.
- **Attract loop:** this is the kiosk's no-customer screen. It reuses the lazy K4 `ShowroomCanvas` with auto-rotation and paint cycling every 4 s, and shows a still car under reduced motion. The whole screen is one button. The idle reset remounts the screen, so it lands back here. A `/kiosk?id=` deep link skips it, and sign-out goes to sign-in, not back to the attract loop.
- **QR continue-on-phone:** the QR is encoded on the device with `uqr` (no dependencies) and drawn as an SVG path, so the customer id never goes to a QR service. It uses the kiosk's own origin (`location.origin`). A real kiosk needs an origin that phones can reach.
- **Showroom reviews per model year:** the showroom passes the trim's year (`GET /market/{model}?year=`, already in the contract), so Sameera's 2027 Camry SE Hybrid shows 2027 reviews, not reviews of the 2022 Camry. Both years are in the committed SerpApi snapshot.
- **Privacy blur additions:** recommendation headline, ineligible reason, scenario assumptions, alert title and offer name. All of them can quote dollar amounts.
- **Live spend in K5 testing:** 4 vision calls and 2 Advisor calls (Spanish and English, about 15 s each, both Guardian pass).

## AI-native, persistent, no blur (after the final demo runs)
- **No pre-written answers.** `agents/fallback.json` and Vishwaa's canned inspection are deleted. The Advisor, the inspector and the recommendation explanation are always written live by the model and checked by the Guardian (one rewrite allowed). If nothing checked is ready, the API answers **503 Busy** (`Retry-After: 5`); the customer app retries automatically up to 3 times, then offers a "Try again" button. Nothing unchecked is ever shown.
- **Recommendation explanations are AI-written.** `why` and a reason for every alternative (`why_not`) come from one structured (JSON) model answer per customer, built from its own tool calls. The engine still picks the option and computes every number (rule 1). Each explanation is cached by customer + a hash of the engine numbers, in memory and in Supabase, so it's written once and rewritten only when the numbers change. The three personas are written at API startup (`NEXTMOVE_WARM=0` turns that off; tests do).
- **Deploy gate without canned answers:** each persona eval checks the engine's pick and, once written, that persona's live AI explanation against the Guardian. The live mode (`STUDIO_GATE_LIVE=1`) is unchanged.
- **Faster model:** default `NEXTMOVE_MODEL` is now `claude-haiku-5-5`; set it to a Sonnet model for longer answers. **No streaming:** streamed text would reach the customer before the Guardian checks it (rule 2).
- **Durable demo state:** handoffs, deal packets, offers, Studio agents, the audit log, employee reviews and AI explanations are saved to one Supabase table, `app_store` (`migrations/003_app_store.sql`), and reloaded at startup. Without Supabase the API still runs in memory.
- **Contract addition (explicit):** `POST /customers/{id}/actions` records the customer's own confirmed "start self-service" and "due-date change" (L3) in the audit log; `503 Busy` is documented on the three AI endpoints. The new enum is named `CustomerActionType` so generated model names didn't shift. Contract now has 30 operations.
- **Privacy blur removed** at the team's request: the data is synthetic, and numbers are always visible on phone and kiosk. `KioskContext` keeps the kiosk-only behavior (attract loop, idle reset, surface label).

## Gemini, real prices, real photos
- **Gemini primary, Claude backup** (`agents/llm.py`). Every agent call (Advisor, Hardship, explainer, inspector) tries Gemini first through its REST API with the same 12-tool registry (`agents/gemini.py`: schemas converted to Gemini's OpenAPI subset, a manual tool loop that records every call, only declared tools can run). Any Gemini failure falls back to the Claude Agent SDK; only when both fail does the API answer 503. The Guardian checks whichever answered. Without `GEMINI_API_KEY` it's Claude only.
- **Real MSRPs from SerpApi** (sponsor). `serpapi/queries.msrp` searches "YEAR Toyota MODEL TRIM MSRP"; `market.parse_msrp` takes a price stated right after the trim name (or "MSRP starts at" for base trims), prefers toyota.com, and skips dealer inventory pages, "Grand" variants and cut-off multi-trim price lists. Results are cached (Supabase + snapshot) and used by the engine: base-trim MSRP for the depreciation fallback, next-model-year trim MSRP for the upgrade target, with source + as-of in the assumptions. Config prices remain the labelled fallback when no MSRP is found (RAV4 XLE Hybrid, Tacoma TRD Sport i-FORCE MAX, Highlander XLE Hybrid today). The synthetic portfolio generator still uses config prices, so the 1,200 customers stay deterministic.
- **Real photos replace the 3D car.** One freely licensed Wikimedia Commons photo per model (CC BY, CC BY-SA or CC0), loaded from Wikimedia's servers (nothing copied into the repo), always with author, license and source on screen (`components/car-photo.tsx`, `lib/cars.ts`). Photos show the current generation of each model, which can be newer than a customer's car. The showroom became a photo page with features, trims priced by the engine and reviews; the kiosk attract screen cross-fades the photos. three, @react-three/fiber and @react-three/drei are removed. The paint picker is gone: it can't recolor a real photo honestly.

## Kiosk as one service: live voice, walk-in tools
- **Live voice calls (Gemini Live, native audio).** "Talk to someone" opens a call: a US ringback (WebAudio) while connecting, then the voice agent over the FastAPI WebSocket `/voice/{customer_id}` (`agents/live.py`). The API holds the Gemini session and the key; the browser sends mic PCM16 at 16 kHz and plays model PCM16 at 24 kHz. Tools are the Advisor's registry plus `handoff_to_human`; only the customer ID reaches the model (rule 6). Default model `gemini-3.8-live` (`GEMINI_LIVE_MODEL`), checked live: setup 0.2 s, two tool calls and first audio in about 2.6 s, digits in the transcript.
- **Rule 2 for voice (team decision).** Speech can't be held back for review without losing a natural call, so the Guardian checks each finished agent turn as soon as it ends (numbers, fairness, tone, consent, injection; the written estimate disclosure is on the call screen instead). A failed turn is flagged on the caller's captions and in the console, and the model gets a `[Guardian]` message to correct itself out loud. Numbers still come only from tools (rule 1). Text answers keep the strict check-before-show rule. Known limit: the check reads the model's own transcript, so a number it speaks but writes in words isn't matched.
- **One service with the console.** Every finished line is broadcast as a full `Call` on Realtime channel `calls` (event `updated`); the console's Live Activity shows each call's transcript and flags. **Take over** (`POST /calls/{id}/takeover`) cancels the AI side, tells the caller who joined, and records a claimed handoff. The rep types (`POST /calls/{id}/messages`); the kiosk shows and reads it aloud, and the browser transcribes the caller (Web Speech) for the rep. Real two-way rep audio (WebRTC) is out of scope. If Gemini is down, the caller hears that a specialist was notified and a waiting handoff is created. A call keeps the kiosk's idle reset from firing; every call writes one `voice` trace.
- **Walk-in guests can call.** `/voice/GUEST` gets only `estimate_payment`, `get_market_value`, `find_dealer` and `get_recalls`, and no handoff record (there's no account to attach it to).
- **Walk-in tools.** `POST /estimate` (engine/estimate.py, also the `estimate_payment` tool) prices up to 3 new Toyotas: real cached MSRP, engine loan and lease payments (lease residual and term in `[estimate]` config), true cost, CO2 and a 5-year cost; plus an optional trade-in valued from SerpApi comps with equity after payoff. A model-year with no cached comps gets one live SerpApi search (then cached; the client's per-process budget applies), else the depreciation table, labelled. When down payment plus equity exceed a lease's depreciation, the lease is just the rent charge and an assumption says how much would come back.
- **Take it home** is a QR to `/app/summary?m=…&d=…&n=…&c=…&t=…`: inputs only, validated on the phone (`lib/walk-in.ts`), which asks the engine again. No numbers or personal data ride in the link.
- **Contract additions (explicit):** `POST /estimate`, `GET /calls`, `POST /calls/{id}/takeover`, `POST /calls/{id}/messages` and their schemas, with every enum named (`CallRole`, `CallStatus`) so generated model names didn't shift. Contract now has 34 operations; the WebSocket is documented here and in the README.
- **Skipped:** printing the summary, VIN/plate photo reading, rep voice (WebRTC), a call link on Customer 360.

## Demo polish: team accounts, Toyota branding, voice sign-in
- **Demo accounts are the team.** Maria/James/Priya became **Vishwaa** (`CUST-VISHWAA2026`, lease ending), **Sameera** (`CUST-SAMEERA2026`, equity + hybrid upgrade) and **Hung** (`CUST-HUNG2026`, missed payment / hardship). First names only on screen. Rows saved in Supabase under the old IDs are left untouched but never loaded (`tools/store.RETIRED`). Sign-in accepts a name ("Vishwaa", one match) or any spelling of the ID ("vishwaa 2026").
- **No demo or synthetic labels (team decision, replaces the old rule 5 badge).** The "Synthetic data" badge, the console banner and the "Demo customers" buttons are gone; source labels no longer say "(synthetic)" ("NextMove valuation model", "Toyota list price"). The data is still generated and there is still no real customer data; estimate disclaimers stay.
- **Real MSRPs for all six models.** RAV4 (2026 is hybrid-only, so the target trim is "XLE Premium Hybrid", $36,100 on toyota.com) and Tacoma TRD Sport i-FORCE MAX ($47,335, toyota.com) now parse; the next model year falls back to this year's MSRP while next year's isn't published. `parse_msrp` skips dealer asking prices ("Dealer price", "mi away"). Highlander Hybrid XLE has no clean match, so its catalog price is set to the real 2026 MSRP ($49,115, Kelley Blue Book via the cached SerpApi search).
- **Toyota branding.** Official toyota.com imagery (studio shots on transparent backgrounds for every car card; lifestyle photos on the attract screen) is hot-linked from Toyota's own CDNs, and the Toyota Financial Services lockup (Toyota emblem and wordmark from toyota.com, "Financial Services" beneath, as on TFS materials) replaces the text mark in both apps. Toyota is the event sponsor and the team confirmed it permits this use. If Toyota's CDN refuses an image, the Wikimedia Commons photo is the fallback.
- **toyota.com look.** Helvetica Neue (toyota.com's fallback family; their own font is proprietary), rectangular buttons with 8px corners (`btn-primary` red, `btn-secondary` black, `btn-outline`), smaller card radius, lucide line icons instead of emojis.
- **Voice sign-in.** `identify_customer(name, vehicle_model)` (L1): the first name or ID must match, and so must the Toyota they drive, on exactly one account. It returns only the customer ID. Spoken names are matched tolerantly (doubled letters collapsed, close spellings accepted: speech-to-text heard "Vishwa"). Three tries per call. Before verification, account tools are refused; after, every account tool is pinned to the verified ID. The spoken name is masked in traces. The kiosk shows "Account found" and opens the account when the call ends; the console card switches from Walk-in guest to the customer live.
- **Natural rep voice.** A rep's typed message is spoken with Gemini TTS (`gemini-3.8-flash-tts`, voice "Charon", about 3.5 s) and played through the same audio path as the agent; the AI agent has its own fixed voice ("Aoede"). If TTS fails, the kiosk falls back to the browser voice.

