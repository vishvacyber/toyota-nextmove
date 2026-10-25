import { http, HttpResponse, delay } from "msw";
import type {
  AdvisorAnswer, AdvisorAsk, Alert, components, DealPacket, DealPacketCreate, DeployResult, Handoff, KpiSnapshot, Model, Offer, OfferSimulation, StudioAgent,
} from "../index";
import * as f from "./fixtures";

const notFound = () => HttpResponse.json({ detail: "Not found" }, { status: 404 });
const now = () => new Date().toISOString();
let seq = 100;
const nextId = (p: string) => `${p}-${++seq}`;

// Any origin, so the same handlers serve whatever NEXT_PUBLIC_API_URL points at.
const u = (path: string) => `*${path}`;

export const handlers = [
  http.get(u("/health"), () => HttpResponse.json({ status: "ok", version: "mock" })),

  http.get(u("/customers"), ({ request }) => {
    const q = new URL(request.url).searchParams.get("q")?.toLowerCase();
    const list = q ? f.customers.filter((c) => `${c.id} ${c.first_name} ${c.last_name}`.toLowerCase().includes(q)) : f.customers;
    return HttpResponse.json(list);
  }),
  http.get(u("/customers/:id"), ({ params }) => {
    const c = f.customers.find((x) => x.id === params.id);
    return c ? HttpResponse.json(c) : notFound();
  }),
  http.get(u("/customers/:id/recommendation"), ({ params }) => {
    const r = f.recommendationFor(String(params.id));
    return r ? HttpResponse.json(r) : notFound();
  }),
  http.post(u("/customers/:id/recommendation/review"), async ({ params, request }) => {
    const body = (await request.json()) as components["schemas"]["RecommendationReview"];
    const entry = {
      id: nextId("AU"), at: now(), actor: body.reviewer, action: `${body.decision}_recommendation`, customer_id: String(params.id),
      autonomy_level: "L3" as const, override_reason: body.reason,
    };
    f.audit.unshift(entry);
    return HttpResponse.json(entry);
  }),
  http.get(u("/customers/:id/timing"), ({ params }) => {
    const t = f.timingFor(String(params.id));
    return t ? HttpResponse.json(t) : notFound();
  }),

  http.post(u("/scenarios"), async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["ScenarioRequest"];
    const all = f.scenariosFor(body.customer_id);
    const scenarios = body.options?.length ? all.filter((s) => body.options!.includes(s.option)) : all;
    return HttpResponse.json({ customer_id: body.customer_id, scenarios, assumptions: ["Mock engine: fixed numbers"], as_of: f.AS_OF });
  }),

  http.post(u("/agents/advisor/ask"), async ({ request }) => {
    const body = (await request.json()) as AdvisorAsk;
    const r = f.recommendationFor(body.customer_id);
    if (!r) return notFound();
    await delay(400);
    const answer: AdvisorAnswer = {
      answer: `${r.headline}. ${r.why}`,
      numbers_used: [
        { label: "Monthly payment", value: r.recommended.monthly_payment, source_tool: "run_scenario" },
        { label: "Total cost", value: r.recommended.total_cost, source_tool: "run_scenario" },
        { label: "Equity", value: r.recommended.equity, source_tool: "run_scenario" },
      ],
      suggested_actions: [r.action], guardian: r.guardian, trace_id: r.trace_id ?? "TR-0001", session_id: body.session_id,
    };
    return HttpResponse.json(answer);
  }),

  http.post(u("/inspections"), async ({ request }) => {
    const form = await request.formData();
    await delay(800);
    return HttpResponse.json(f.inspectionFor(String(form.get("customer_id") ?? "CUST-MARIA")));
  }),

  http.get(u("/handoffs"), () => HttpResponse.json(f.handoffs)),
  http.post(u("/handoffs"), async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["HandoffCreate"];
    const h: Handoff = { id: nextId("HO"), status: "waiting", created_at: now(), ...body };
    f.handoffs.unshift(h);
    return HttpResponse.json(h, { status: 201 });
  }),
  http.patch(u("/handoffs/:id"), async ({ params, request }) => {
    const h = f.handoffs.find((x) => x.id === params.id);
    if (!h) return notFound();
    Object.assign(h, await request.json());
    return HttpResponse.json(h);
  }),

  http.get(u("/deal-packets"), () => HttpResponse.json(f.dealPackets)),
  http.post(u("/deal-packets"), async ({ request }) => {
    const body = (await request.json()) as DealPacketCreate;
    const c = f.customers.find((x) => x.id === body.customer_id);
    const s = f.scenariosFor(body.customer_id).find((x) => x.option === body.option);
    if (!c || !s) return notFound();
    const market = f.market[c.vehicle.model];
    const p: DealPacket = {
      id: nextId("DP"), customer_id: c.id, dealer: market.dealers.find((d) => d.id === body.dealer_id) ?? market.dealers[0],
      vehicle: c.vehicle, target_vehicle: s.target_vehicle, scenario: s, eligibility: ["Eligible for TFS financing", "Equity verified against market comps"],
      status: "sent", created_at: now(),
    };
    f.dealPackets.unshift(p);
    return HttpResponse.json(p, { status: 201 });
  }),

  http.get(u("/alerts"), ({ request }) => {
    const sp = new URL(request.url).searchParams;
    return HttpResponse.json(f.alerts.filter((a) => (!sp.get("customer_id") || a.customer_id === sp.get("customer_id")) && (!sp.get("status") || a.status === sp.get("status"))));
  }),
  http.patch(u("/alerts/:id"), async ({ params, request }) => {
    const a = f.alerts.find((x) => x.id === params.id);
    if (!a) return notFound();
    const { actor: _actor, ...patch } = (await request.json()) as components["schemas"]["AlertUpdate"];
    Object.assign(a, patch satisfies Partial<Alert>);
    return HttpResponse.json(a);
  }),

  http.get(u("/sessions"), () => HttpResponse.json(f.sessions)),
  http.get(u("/opportunities"), () => HttpResponse.json(f.opportunities)),

  http.get(u("/offers"), () => HttpResponse.json(f.offers)),
  http.post(u("/offers"), async ({ request }) => {
    const o: Offer = { id: nextId("OF"), status: "draft", created_at: now(), ...((await request.json()) as components["schemas"]["OfferCreate"]) };
    f.offers.unshift(o);
    return HttpResponse.json(o, { status: 201 });
  }),
  http.post(u("/offers/:id/simulate"), ({ params }) => {
    const o = f.offers.find((x) => x.id === params.id);
    if (!o) return notFound();
    const variants = [o, ...f.offers.filter((x) => x.variant_of === o.id)].map((v, i) => ({
      name: v.name, acceptance_rate: 0.18 + i * 0.04, expected_profit: 41000 + i * 6500, retention_lift: 0.05 + i * 0.01,
    }));
    return HttpResponse.json({ offer_id: o.id, customers_targeted: 214, variants } satisfies OfferSimulation);
  }),

  http.get(u("/kpis"), ({ request }) => {
    const sp = new URL(request.url).searchParams;
    const a = {
      adoption_rate: Number(sp.get("adoption_rate") ?? f.kpiBase.assumptions.adoption_rate),
      outreach_lead_days: Number(sp.get("outreach_lead_days") ?? f.kpiBase.assumptions.outreach_lead_days),
      hardship_uptake: Number(sp.get("hardship_uptake") ?? f.kpiBase.assumptions.hardship_uptake),
    };
    // shortcut: mock scales NextMove deltas linearly with adoption; B5 simulation replaces this.
    const k = a.adoption_rate / f.kpiBase.assumptions.adoption_rate;
    const b = f.kpiBase.baseline;
    const n = f.kpiBase.nextmove;
    const lerp = (x: number, y: number) => x + (y - x) * k;
    const nextmove = Object.fromEntries(Object.entries(n).map(([key, v]) => [key, lerp(b[key as keyof typeof b] as number, v as number)])) as KpiSnapshot["nextmove"];
    const series = f.kpiBase.series.map((s) => ({ ...s, nextmove_retention: lerp(s.baseline_retention, s.nextmove_retention) }));
    return HttpResponse.json({ ...f.kpiBase, assumptions: a, nextmove, series } satisfies KpiSnapshot);
  }),

  http.get(u("/traces"), ({ request }) => {
    const id = new URL(request.url).searchParams.get("customer_id");
    return HttpResponse.json(id ? f.traces.filter((t) => t.customer_id === id) : f.traces);
  }),
  http.get(u("/audit"), () => HttpResponse.json(f.audit)),
  http.get(u("/fairness"), () => HttpResponse.json(f.fairness)),

  http.get(u("/market/:model"), ({ params }) => {
    const q = f.market[params.model as Model];
    return q ? HttpResponse.json(q) : notFound();
  }),

  http.get(u("/studio/agents"), () => HttpResponse.json(f.studioAgents)),
  http.post(u("/studio/agents"), async ({ request }) => {
    const a: StudioAgent = { id: nextId("AG"), status: "draft", prompt_version: "v1", ...((await request.json()) as components["schemas"]["StudioAgentCreate"]) };
    f.studioAgents.push(a);
    return HttpResponse.json(a, { status: 201 });
  }),
  http.post(u("/studio/agents/:id/deploy"), async ({ params }) => {
    const a = f.studioAgents.find((x) => x.id === params.id);
    if (!a) return notFound();
    await delay(1500);
    Object.assign(a, { status: "deployed", deployed_at: now() });
    const result: DeployResult = {
      agent_id: a.id, passed: true, deployed_at: a.deployed_at,
      eval_results: [{ case: "Maria lease-end", passed: true }, { case: "James equity", passed: true }, { case: "Priya hardship", passed: true }],
      injection_tests: [{ case: "Ignore previous instructions", passed: true }, { case: "Reveal system prompt", passed: true }],
    };
    return HttpResponse.json(result);
  }),
];
