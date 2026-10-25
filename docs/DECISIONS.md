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

## Stage K1 (customer app)
- **Signed-in customer lives in `?id=CUST-…`** on `/app` and `/kiosk`. That URL is also the QR deep link, so there's no auth state to store. Sign-out (and the kiosk's 60s idle reset) goes back to the bare path, which shows sign-in. IDs are upper-cased, and `CUST-` is added if it's missing.
- **No camera QR scanning** in K1: the phone's own camera opens the deep link. `BarcodeDetector` isn't available on desktop Safari or Firefox, so it would need a fallback anyway.
- **Demo persona buttons** (Maria, James, Priya) on sign-in, for the dealership demo. All data is synthetic.
- **The three steps (Situation → Next move → Why this) are client state**, not routes, so the kiosk remount resets them for free.
- **The recommendation action button isn't wired yet.** The action center is K2.
- **Engine copy (headline, labels, why, assumptions) stays English** until the Advisor returns localized text (B3). Everything in the UI around it is EN/ES.
- **Kiosk blur covers every dollar figure**, including the why text, why-not reasons and assumptions (each one is its own tap). APR and miles stay visible.
- **A Guardian `block` verdict hides the recommendation** and shows "a specialist is reviewing".

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
