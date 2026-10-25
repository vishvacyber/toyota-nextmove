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
