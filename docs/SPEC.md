# Toyota NextMove — Product and Build Spec

## 1. Vision
NextMove is a proactive financial co-pilot for every Toyota Financial Services customer. It watches each customer's situation, reaches out at the right moment, shows realistic options in plain language with exact numbers, and guides them to one clear next step. Employees see the whole portfolio, the profit impact, and every AI decision.

**Problems solved:** customers decide too late and leave; options are confusing; service effort (calls) is high; payment stress is caught too late.

## 2. Requirement coverage
| Requirement | Track | How we meet it |
| --- | --- | --- |
| Personalize | Toyota | Synthetic Customer 360: contract, mileage, payment history, life events |
| Simplify | Toyota | Engine computes options; AI explains assumptions, trade-offs, why-not |
| Guide | Toyota | One recommended next step with a single action |
| Value | Toyota | 1,000+ customer simulation, baseline vs. NextMove KPIs |
| Working prototype | Toyota | Deployed, both surfaces connected live |
| Synthetic data | Toyota | Generator + simulation + labelled everywhere |
| Responsible AI | Toyota | No protected attributes, fairness report, audit, overrides, Guardian |
| Reimagine CX | Toyota | Proactive agents, voice EN/ES, kiosk, 3D next car |
| Reusable agent platform | Platform | Agent Studio: templates, tool registry, guardrails, traces, evals |
| Enterprise grade | Platform | RBAC, secrets via env, prompt-injection deploy gate |
| Meaningful SerpApi use | SerpApi | Comps, dealers, recalls, trends, reviews drive real decisions |

## 3. Customer situations
| Situation | Trigger | Options compared |
| --- | --- | --- |
| Lease-end | 90/60/30 days to maturity | Buy out at lease-end value, return, new lease/finance, extend |
| Mileage overage | Projected miles > allowance | Buyout vs. pay overage, early upgrade |
| Positive equity (loan) | Market value > payoff | Keep, trade in, upgrade to hybrid/EV |
| Rate drop | Market rate < contract APR | Keep vs. refinance with TFS |
| Early payoff | Near payoff / extra cash | Pay extra, pay off, keep |
| Life event | Customer-reported | Bigger vehicle, smaller payment, extension |
| Payment stress | Late/missed payment | Due-date change, deferral, extension, human assist |
| EV/hybrid switch | High fuel spend | Total cost current vs. hybrid/EV |

Always include "do nothing" as baseline. Show only eligible options.

## 4. Agentic layer
| Agent | Runs | Does |
| --- | --- | --- |
| Orchestrator | Always | Routes requests/events; keeps context for handoff |
| Advisor | App, kiosk, voice | Plans, runs scenarios, checks eligibility + market value, recommends, books |
| Sentinel | Daily scan | Detects triggers, drafts outreach, ranks console queue |
| Hardship | On payment stress | Gathers situation, proposes policy-limited options, escalates |
| Market Intel | Scheduled | SerpApi research, refreshes values, flags recalls/incentives |
| Guardian | Before any output | Numbers match tools, fairness, tone, consent, disclosures; block or send back |

**Tools (MCP):** `get_customer`, `run_scenario`, `check_eligibility`, `get_market_value`, `find_dealer`, `get_recalls`, `book_appointment`, `create_offer_draft`, `handoff_to_human`, `log_decision`, `inspect_photos`, `get_timing`.

**Autonomy:** L1 read = auto · L2 draft = auto + visible · L3 customer-facing = consent/approval · L4 money/credit = humans only.

Every agent run writes an `AgentTrace` (plan, tool calls, Guardian verdict, action) to Supabase `traces`.

## 5. High-value features
Must-build:
1. **Lease-end photo pre-inspection** — guided photos, vision model flags wear items, estimates charges.
2. **Best-time-to-move optimizer** — month-by-month equity/payment/fees; "act now vs. wait 3 months" in $.
3. **Deal-ready dealer packet** — pre-filled vehicle, numbers, eligibility sent to dealer.
4. **True cost + CO2** — payment, fuel, maintenance, insurance estimate; CO2 saved.
5. **Next-best-action with $ value** — console queue shows expected profit, retention odds, script.

If time: loyalty credits, paycheck-aligned due date, offer A/B testing, connected-car twin (synthetic telematics).

Out of scope: social, insurance quoting, owner chat, heavy gamification.

## 6. Data entities
Customer, Vehicle, Contract, Scenario, Recommendation, Alert, Handoff, DealPacket, InspectionResult, Offer, AgentTrace, MarketQuote, KpiSnapshot. (Fields in `packages/contracts/openapi.yaml`.)

## 7. API endpoints
| Method + path | Used by |
| --- | --- |
| `GET /customers`, `GET /customers/{id}` | Both |
| `POST /scenarios` | Both (what-if) |
| `POST /agents/advisor/ask` | App |
| `GET /customers/{id}/recommendation` | Both |
| `GET /customers/{id}/timing` | App |
| `POST /inspections` | App |
| `POST /handoffs`, `PATCH /handoffs/{id}` | App / Console |
| `POST /deal-packets` | App |
| `GET /opportunities` | Console |
| `GET/POST /offers`, `POST /offers/{id}/simulate` | Console |
| `GET /kpis` | Console |
| `GET /traces`, `GET /audit`, `GET /fairness` | Console |
| `GET /market/{model}` | Both |
| `GET/POST /studio/agents`, `POST /studio/agents/{id}/deploy` | Console |

Realtime channels: `sessions`, `handoffs`, `traces`, `alerts`.

## 8. Repo layout
```
apps/console        Next.js + shadcn employee console
apps/customer       Next.js PWA: /app (phone), /kiosk (kiosk)
services/api        FastAPI: engine, agents, tools, serpapi, simulation
packages/contracts  openapi.yaml, generated types, mocks/
packages/tokens     design tokens
docs/               SPEC.md, DECISIONS.md
```

## 9. Build stages

### Backend (B)
| Stage | Build | Done when |
| --- | --- | --- |
| B0 Contract | OpenAPI, TS types, mock fixtures for 3 personas | Both frontends run fully on mocks |
| B1 Data + engine | Generator (1,000+ customers), engine for 7 options, eligibility rules | `/scenarios` correct; unit tests on math pass |
| B2 Tools + SerpApi | Tools as MCP servers; SerpApi wrappers + cache; seeded demo cache | Each tool callable alone; demo works offline |
| B3 Agents | 6 agents, traces to Supabase | Advisor answers a persona question end to end with a trace |
| B4 Value features | Timing, inspection (vision), deal packet, true cost + CO2, NBA scoring | Real results for 3 personas |
| B5 Proof + trust | Simulation, KPIs, fairness, audit, Studio deploy gate | Console Proof + Responsible AI show real numbers |

### Console (C)
| Stage | Build | Done when |
| --- | --- | --- |
| C0 Foundation | Shell, sidebar, role switcher, theme, shadcn, MSW | All pages load mock data |
| C1 Core portfolio | Command Center, Opportunity Queue, Customer 360 | Advisor finds the 3 personas and sees why |
| C2 Act + connect | NextMove Review (override), Live Activity, handoff inbox, deal packets, alert approvals | A mock handoff appears live and can be claimed |
| C3 Prove value | Proof dashboard, Long-term Profit, Offer Studio (+A/B), Market Intel | Assumption slider updates every KPI |
| C4 Trust + agents | Agent trace panel, Responsible AI, Agent Studio | Recall Notifier deploys from template in < 60s |
| C5 Integrate + polish | Real API, skeletons, empty/error states, Cmd+K | Demo runs on live data with cache fallback |

Cut order: A/B testing → Studio template deploy → Long-term Profit page.

### Customer App (K)
| Stage | Build | Done when |
| --- | --- | --- |
| K0 Foundation | `/app` + `/kiosk`, kiosk shell (idle reset, privacy blur), tokens, i18n, MSW | Both modes load Maria |
| K1 Core flow | Sign in / QR / guest, My situation, My next move, Why this | Each persona sees correct recommendation + explanation |
| K2 Decide + act | What-if sliders, timing optimizer, true cost + CO2, action center, handoff status | James: recommendation → deal packet sent |
| K3 AI experiences | Photo pre-inspection, chat + voice (EN/ES), alerts inbox, hardship flow | Maria gets estimate; Priya completes hardship |
| K4 3D Showroom | R3F 360°, exploded view slider, hotspots, trim/color, reviews summary | Smooth on demo laptop + kiosk screen |
| K5 Polish + integrate | Attract loop, QR continue-on-phone, real API, perf + a11y pass | Demo runs on live data with cache fallback |

Cut order: exploded view → voice → QR continue → Spanish.

## 10. Integration gates
1. **Contract frozen** — end of Stage 0.
2. **Swap mocks for API** — after B3, screen by screen.
3. **Demo freeze** — 3 hours before deadline; bug fixes only; record backup video.

## 11. Demo script (3 min)
1. Maria at kiosk: photo pre-inspection estimates wear charges; buyout beats return; taps "start buyout".
2. James: live comps show positive equity; timing optimizer says don't wait; hybrid lowers total cost; explores in 3D; deal packet sent.
3. Priya: hardship agent offers paycheck-aligned due date + human callback.
4. Console: sessions live with agent traces; queue with $ value; Proof dashboard; fairness report; deploy Recall Notifier in 60s.

## 12. Risks
| Risk | Fallback |
| --- | --- |
| SerpApi quota/network | Pre-seeded cache |
| LLM slow/down | Pre-generated explanations for personas |
| 3D model heavy / not explodable | Stylized generic model |
| Scope | Follow cut orders |
| Live demo breaks | Backup video |
