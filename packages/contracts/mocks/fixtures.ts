// Synthetic mock data for Stage 0. The B1 engine replaces these numbers; until then they are hand-set to be plausible.
import type {
  AgentTrace, Alert, AuditEntry, Customer, DealPacket, Dealer, FairnessReport, Handoff, InspectionResult,
  KpiSnapshot, MarketQuote, Model, Offer, Opportunity, Recommendation, Scenario, Session, StudioAgent, TimingPlan, Vehicle,
} from "../index";

export const AS_OF = "2026-10-24T09:00:00Z";
const TODAY = new Date("2026-10-24T00:00:00Z");
const day = (offset: number) => new Date(TODAY.getTime() + offset * 864e5).toISOString().slice(0, 10);
const ago = (minutes: number) => new Date(Date.parse(AS_OF) - minutes * 6e4).toISOString();

// ---------- personas ----------
const maria: Customer = {
  id: "CUST-MARIA", first_name: "Maria", last_name: "Alvarez", email: "maria.a@example.test", phone: "555-0101",
  region: "South", credit_tier: "A", preferred_language: "en", pay_frequency: "semimonthly", next_payday: day(7),
  vehicle: { vin: "SYN2T3RAV4MARIA001", model: "RAV4", year: 2024, trim: "XLE", powertrain: "gas", color: "Blueprint", odometer_miles: 41200, mpg: 30 },
  contract: {
    id: "LSE-1001", type: "lease", start_date: "2024-01-22", maturity_date: day(90), term_months: 36, monthly_payment: 389,
    apr: 3.9, payoff_amount: 23617, residual_value: 22450, annual_mile_allowance: 12000, excess_mile_fee: 0.25,
    projected_miles_at_maturity: 45800, payments_made: 33, days_past_due: 0, status: "current", due_day: 22,
  },
  payment_history: [{ date: "2026-09-22", amount: 389, status: "paid" }, { date: "2026-10-22", amount: 389, status: "paid" }],
  life_events: [], risk_score: 0.08, situation: "lease_end", synthetic: true,
};

const james: Customer = {
  id: "CUST-JAMES", first_name: "James", last_name: "Carter", email: "james.c@example.test", phone: "555-0102",
  region: "West", credit_tier: "A", preferred_language: "en", pay_frequency: "biweekly", next_payday: day(4),
  vehicle: { vin: "SYN4T1CAMRYJAMES02", model: "Camry", year: 2022, trim: "SE", powertrain: "gas", color: "Midnight Black", odometer_miles: 48900, mpg: 28 },
  contract: {
    id: "LN-2002", type: "loan", start_date: "2022-09-15", maturity_date: "2028-09-15", term_months: 72, monthly_payment: 496,
    apr: 5.9, payoff_amount: 10760, payments_made: 49, days_past_due: 0, status: "current", due_day: 15,
  },
  payment_history: [{ date: "2026-09-15", amount: 496, status: "paid" }, { date: "2026-10-15", amount: 496, status: "paid" }],
  life_events: ["longer_commute"], risk_score: 0.05, situation: "positive_equity", synthetic: true,
};

const priya: Customer = {
  id: "CUST-PRIYA", first_name: "Priya", last_name: "Shah", email: "priya.s@example.test", phone: "555-0103",
  region: "Midwest", credit_tier: "B", preferred_language: "en", pay_frequency: "biweekly", next_payday: day(6),
  vehicle: { vin: "SYNJTDPRIUSPRIYA03", model: "Prius", year: 2023, trim: "LE", powertrain: "hybrid", color: "Wind Chill Pearl", odometer_miles: 31500, mpg: 57 },
  contract: {
    id: "LN-3003", type: "loan", start_date: "2023-03-05", maturity_date: "2028-03-05", term_months: 60, monthly_payment: 468,
    apr: 4.9, payoff_amount: 7640, payments_made: 43, days_past_due: 19, status: "missed", due_day: 5,
  },
  payment_history: [
    { date: "2026-08-05", amount: 468, status: "paid" },
    { date: "2026-09-05", amount: 468, status: "late" },
    { date: "2026-10-05", amount: 0, status: "missed" },
  ],
  life_events: ["job_change"], risk_score: 0.71, situation: "payment_stress", synthetic: true,
};

// ---------- 20 extra synthetic customers (deterministic) ----------
const FIRST = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Jamie", "Drew", "Skyler", "Reese", "Cameron", "Rowan", "Sage", "Emerson", "Hayden", "Parker", "Logan", "Blake"];
const LAST = ["Brooks", "Reed", "Hayes", "Price", "Foster", "Bennett", "Ward", "Cole", "Gray", "Perry", "Long", "Fisher", "Hunt", "Stone", "Lane", "Wells", "Burke", "Dunn", "Shaw", "Frost"];
const MODELS: Model[] = ["Camry", "RAV4", "Tacoma", "Highlander", "Prius", "bZ"];
const POWER: Record<Model, Vehicle["powertrain"]> = { Camry: "gas", RAV4: "hybrid", Tacoma: "gas", Highlander: "hybrid", Prius: "hybrid", bZ: "ev" };
const MPG: Record<Model, number> = { Camry: 32, RAV4: 40, Tacoma: 21, Highlander: 35, Prius: 57, bZ: 114 };
const BASE_VALUE: Record<Model, number> = { Camry: 24000, RAV4: 28500, Tacoma: 34000, Highlander: 39000, Prius: 26500, bZ: 31000 };
const REGIONS: Customer["region"][] = ["South", "West", "Midwest", "Northeast"];
const TIERS: Customer["credit_tier"][] = ["A", "B", "C", "A", "B", "D"];
const SITUATIONS: Customer["situation"][] = ["lease_end", "rate_drop", "positive_equity", "none", "mileage_overage", "early_payoff", "ev_switch", "none"];

const extras: Customer[] = FIRST.map((first, i) => {
  const model = MODELS[i % 6];
  const lease = i % 3 === 0;
  const situation = SITUATIONS[i % SITUATIONS.length];
  const payment = 320 + ((i * 37) % 280);
  const daysToMaturity = situation === "lease_end" ? [30, 60, 90][i % 3] : 200 + i * 23;
  return {
    id: `CUST-${String(1000 + i)}`, first_name: first, last_name: LAST[i], email: `${first.toLowerCase()}@example.test`,
    region: REGIONS[i % 4], credit_tier: TIERS[i % TIERS.length], preferred_language: i % 4 === 1 ? "es" : "en",
    pay_frequency: (["monthly", "biweekly", "semimonthly"] as const)[i % 3], next_payday: day(3 + (i % 10)),
    vehicle: {
      vin: `SYNVIN${String(100000 + i * 7919)}`, model, year: 2021 + (i % 4), trim: ["LE", "XLE", "SE", "Limited"][i % 4],
      powertrain: POWER[model], color: ["Silver", "White", "Gray", "Red"][i % 4], odometer_miles: 18000 + i * 2900, mpg: MPG[model],
    },
    contract: {
      id: `${lease ? "LSE" : "LN"}-${4000 + i}`, type: lease ? "lease" : "loan", start_date: "2023-06-01", maturity_date: day(daysToMaturity),
      term_months: lease ? 36 : 60, monthly_payment: payment, apr: 3.9 + (i % 5) * 0.8, payoff_amount: 8000 + i * 650,
      ...(lease ? { residual_value: Math.round(BASE_VALUE[model] * 0.62), annual_mile_allowance: 12000, excess_mile_fee: 0.25 } : {}),
      payments_made: 20 + (i % 15), days_past_due: 0, status: "current", due_day: 1 + (i * 3) % 28,
    },
    payment_history: [{ date: day(-30), amount: payment, status: "paid" }],
    life_events: [], risk_score: Math.round(((i * 13) % 40) / 100 * 100) / 100, situation, synthetic: true,
  } satisfies Customer;
});

export const customers: Customer[] = [maria, james, priya, ...extras];

// ---------- scenarios + recommendations ----------
const sc = (s: Scenario) => s;

const mariaBuyout = sc({
  option: "buyout", label: "Buy your RAV4", eligible: true, monthly_payment: 444, total_cost: 22750, horizon_months: 60,
  equity: 4850, fees: 300, assumptions: ["Buyout price = residual $22,450 + $300 purchase-option fee", "Financed 60 months at 6.4% APR", "Market value $27,300 (comps, as of today)"],
});
const mariaReturn = sc({
  option: "return", label: "Return it", eligible: true, monthly_payment: 0, total_cost: 3200, equity: 0, fees: 3200,
  assumptions: ["9,800 miles over allowance × $0.25 = $2,450", "$350 disposition fee", "~$400 estimated wear (pre-inspection)"],
});
const mariaNewLease = sc({
  option: "new_lease", label: "Lease a new RAV4", eligible: true, monthly_payment: 459, total_cost: 5200, horizon_months: 36, equity: 0, fees: 3200,
  assumptions: ["Return fees still apply", "$2,000 due at signing"],
});
const mariaExtend = sc({
  option: "extend", label: "Extend 6 months", eligible: true, monthly_payment: 389, total_cost: 2334, horizon_months: 6, equity: 0, fees: 0,
  assumptions: ["Mileage overage keeps growing at about 1,250 miles/month"],
});

const jamesKeep = sc({
  option: "keep", label: "Keep your Camry", eligible: true, monthly_payment: 496, total_cost: 11408, horizon_months: 23, equity: 11640, fees: 0,
  true_cost: { payment: 496, fuel: 121, maintenance: 85, insurance: 145, total_monthly: 847, co2_kg_per_year: 3809 },
  assumptions: ["12,000 miles/year", "Gas at $3.40/gal", "28 MPG"],
});
const jamesUpgrade = sc({
  option: "upgrade", label: "Upgrade to Camry Hybrid", eligible: true, monthly_payment: 422, total_cost: 25970, horizon_months: 60, equity: 11640, fees: 650,
  target_vehicle: { vin: "SYNNEWCAMRYHYB0001", model: "Camry", year: 2027, trim: "SE Hybrid", powertrain: "hybrid", color: "Supersonic Red", odometer_miles: 12, mpg: 51 },
  true_cost: { payment: 422, fuel: 67, maintenance: 45, insurance: 150, total_monthly: 684, co2_kg_per_year: 2091 },
  assumptions: ["$11,640 equity applied to a $33,500 Camry SE Hybrid", "60 months at 5.9% APR", "51 MPG, gas at $3.40/gal"],
});
const jamesTradeIn = sc({
  option: "trade_in", label: "Trade in", eligible: true, monthly_payment: 0, total_cost: 0, equity: 11640, fees: 0,
  assumptions: ["Market value $22,400 − payoff $10,760"],
});
const jamesRefi = sc({
  option: "refinance", label: "Refinance with TFS", eligible: true, monthly_payment: 490, total_cost: 11270, horizon_months: 23, equity: 11640, fees: 0,
  assumptions: ["5.4% APR vs current 5.9%"],
});

const priyaDueDate = sc({
  option: "due_date_change", label: "Move due date to the 20th", eligible: true, monthly_payment: 468, total_cost: 7640, equity: 0, fees: 0,
  assumptions: ["Aligns with your biweekly payday", "No fee; one-time change"],
});
const priyaDeferral = sc({
  option: "deferral", label: "Defer one payment", eligible: true, monthly_payment: 468, total_cost: 7672, equity: 0, fees: 0,
  assumptions: ["Moves the missed payment to the end of the loan", "About $32 extra interest", "Needs approval from a TFS specialist"],
});
const priyaExtend = sc({
  option: "extend", label: "Extend 12 months", eligible: true, monthly_payment: 330, total_cost: 7850, equity: 0, fees: 0,
  assumptions: ["Lower payment, about $210 more interest overall"],
});
const priyaNothing = sc({
  option: "do_nothing", label: "Do nothing", eligible: true, monthly_payment: 468, total_cost: 7690, equity: 0, fees: 50,
  assumptions: ["$50 late fee", "Further missed payments may affect your credit"],
});

const guardianPass: Recommendation["guardian"] = {
  verdict: "pass",
  checks: [
    { name: "numbers_match_tools", passed: true }, { name: "fairness", passed: true }, { name: "tone", passed: true },
    { name: "consent", passed: true }, { name: "disclosures", passed: true },
  ],
};

const personaRecs: Recommendation[] = [
  {
    customer_id: "CUST-MARIA", situation: "lease_end", headline: "Buying your RAV4 beats returning it",
    recommended: mariaBuyout, alternatives: [mariaReturn, mariaNewLease, mariaExtend], baseline: { ...mariaReturn, option: "do_nothing", label: "Do nothing (return at lease end)" },
    why: "Your RAV4 is worth about $27,300 but your buyout price is $22,450. Buying keeps $4,850 of equity and avoids about $2,450 in mileage charges.",
    why_not: [
      { option: "return", reason: "You'd pay about $3,200 in fees and leave $4,850 of equity behind." },
      { option: "new_lease", reason: "Return fees still apply, plus $2,000 at signing." },
    ],
    assumptions: mariaBuyout.assumptions, action: { type: "start_self_service", label: "Start buyout", autonomy_level: "L3" },
    guardian: guardianPass, review: { status: "pending" }, generated_at: AS_OF, trace_id: "TR-0001",
  },
  {
    customer_id: "CUST-JAMES", situation: "positive_equity", headline: "Upgrade to a Camry Hybrid now and pay less each month",
    recommended: jamesUpgrade, alternatives: [jamesKeep, jamesTradeIn, jamesRefi], baseline: { ...jamesKeep, option: "do_nothing", label: "Do nothing" },
    why: "You have $11,640 in equity. Applied to a Camry Hybrid, your payment drops from $496 to $422 and your total monthly cost drops from $847 to $684.",
    why_not: [
      { option: "keep", reason: "Equity shrinks about $210 a month as your Camry ages." },
      { option: "refinance", reason: "Saves only $6 a month." },
    ],
    assumptions: jamesUpgrade.assumptions, action: { type: "send_deal_packet", label: "Send deal packet to dealer", autonomy_level: "L3" },
    guardian: guardianPass, review: { status: "approved", by: "EMP-ADVISOR-1" }, generated_at: AS_OF, trace_id: "TR-0002",
  },
  {
    customer_id: "CUST-PRIYA", situation: "payment_stress", headline: "Move your due date to match your payday",
    recommended: priyaDueDate, alternatives: [priyaDeferral, priyaExtend], baseline: priyaNothing,
    why: "Your pay schedule changed with your new job. Moving your due date to the 20th lines it up with your payday at no cost.",
    why_not: [
      { option: "deferral", reason: "Possible, but it needs a TFS specialist to approve. We've asked one to call you." },
      { option: "extend", reason: "Lowers the payment but adds about $210 in interest." },
    ],
    assumptions: priyaDueDate.assumptions, action: { type: "request_callback", label: "Request a callback", autonomy_level: "L3" },
    guardian: guardianPass, review: { status: "pending" }, generated_at: AS_OF, trace_id: "TR-0003",
  },
];

export function recommendationFor(id: string): Recommendation | undefined {
  const persona = personaRecs.find((r) => r.customer_id === id);
  if (persona) return persona;
  const c = customers.find((x) => x.id === id);
  if (!c) return;
  const keep = sc({
    option: "keep", label: `Keep your ${c.vehicle.model}`, eligible: true, monthly_payment: c.contract.monthly_payment,
    total_cost: c.contract.payoff_amount, equity: 0, fees: 0, assumptions: ["No change to your contract"],
  });
  return {
    customer_id: c.id, situation: c.situation, headline: "You're on track, no change needed", recommended: keep, alternatives: [],
    why: "Your contract is in good shape today. We'll let you know if a better option comes up.", why_not: [], assumptions: keep.assumptions,
    action: { type: "book_appointment", label: "Book a check-in", autonomy_level: "L3" }, guardian: guardianPass, generated_at: AS_OF,
  };
}

export function scenariosFor(id: string): Scenario[] {
  const r = recommendationFor(id);
  return r ? [r.recommended, ...r.alternatives, ...(r.baseline ? [r.baseline] : [])] : [];
}

// ---------- timing ----------
export function timingFor(id: string): TimingPlan | undefined {
  const c = customers.find((x) => x.id === id);
  if (!c) return;
  const equity0 = id === "CUST-JAMES" ? 11640 : id === "CUST-MARIA" ? 4850 : 0;
  const months = Array.from({ length: 7 }, (_, m) => {
    const equity = Math.max(0, equity0 - m * 210);
    const fees = id === "CUST-MARIA" && m > 3 ? 2450 + (m - 3) * 312 : 0;
    return { month_offset: m, date: day(m * 30), equity, payment: c.contract.monthly_payment, fees, net_position: equity - fees };
  });
  return {
    customer_id: id, months, best_month_offset: 0, act_now_vs_wait_3: months[0].net_position - months[3].net_position,
    summary: equity0 ? "Acting now keeps the most equity. Waiting 3 months costs you money." : "No timing advantage right now.",
    as_of: AS_OF,
  };
}

// ---------- market (SerpApi-shaped, cached) ----------
const dealers: Dealer[] = [
  { id: "DLR-01", name: "Lone Star Toyota", address: "1200 Synthetic Pkwy, Austin, TX", rating: 4.7, review_count: 2381, distance_mi: 4.2 },
  { id: "DLR-02", name: "Capital City Toyota", address: "88 Mock Ave, Austin, TX", rating: 4.5, review_count: 1540, distance_mi: 7.9 },
];
export const market: Record<Model, MarketQuote> = Object.fromEntries(
  MODELS.map((model) => {
    const v = model === "RAV4" ? 27300 : model === "Camry" ? 22400 : BASE_VALUE[model];
    return [model, {
      model, year: model === "Camry" ? 2022 : 2024, estimated_value: v, low: Math.round(v * 0.94), high: Math.round(v * 1.06),
      comps: [1, 2, 3].map((n) => ({ title: `${model} comp listing ${n}`, price: Math.round(v * (0.96 + n * 0.02)), miles: 30000 + n * 6000, source_url: `https://example.test/comps/${model}/${n}` })),
      trend: { direction: model === "Prius" || model === "RAV4" ? "up" : "flat", demand_index: model === "RAV4" ? 82 : 64 },
      recalls: model === "Tacoma" ? [{ title: "Rear axle nut may loosen", date: "2026-08-14", source_url: "https://example.test/recalls/tacoma" }] : [],
      reviews_summary: `Reviewers praise the ${model}'s reliability and resale value.`,
      dealers, source: "SerpApi (cached)", as_of: AS_OF, cached: true,
    } satisfies MarketQuote];
  }),
) as Record<Model, MarketQuote>;

// ---------- console data ----------
export const opportunities: Opportunity[] = [
  { customer_id: "CUST-MARIA", customer_name: "Maria Alvarez", model: "RAV4", situation: "lease_end", next_best_action: "buyout", expected_value: 1850, retention_odds: 0.78, days_to_maturity: 90, script: "Your RAV4 is worth more than your buyout price. Want to see the numbers?", reason: "Lease ends in 90 days; projected 9,800 miles over", priority: 1 },
  { customer_id: "CUST-JAMES", customer_name: "James Carter", model: "Camry", situation: "positive_equity", next_best_action: "upgrade", expected_value: 2600, retention_odds: 0.71, script: "You have about $11,600 in equity. A hybrid could lower your monthly cost.", reason: "$11,640 positive equity; high fuel spend", priority: 1 },
  { customer_id: "CUST-PRIYA", customer_name: "Priya Shah", model: "Prius", situation: "payment_stress", next_best_action: "due_date_change", expected_value: 920, retention_odds: 0.64, script: "We noticed a missed payment. Can we align your due date with your payday?", reason: "Missed Oct payment after job change; 19 days past due", priority: 1 },
  ...extras.filter((c) => c.situation !== "none").map((c, i): Opportunity => ({
    customer_id: c.id, customer_name: `${c.first_name} ${c.last_name}`, model: c.vehicle.model, situation: c.situation,
    next_best_action: ({ lease_end: "buyout", rate_drop: "refinance", positive_equity: "upgrade", mileage_overage: "buyout", early_payoff: "pay_extra", ev_switch: "upgrade" } as const)[c.situation as "lease_end"] ?? "keep",
    expected_value: 300 + ((i * 271) % 1800), retention_odds: 0.4 + ((i * 7) % 40) / 100,
    days_to_maturity: c.contract.type === "lease" ? Math.round((Date.parse(c.contract.maturity_date) - TODAY.getTime()) / 864e5) : undefined,
    script: "Reach out with the recommended option.", reason: `Situation: ${c.situation.replace("_", " ")}`, priority: 2 + (i % 3),
  })),
];

export const kpiBase: KpiSnapshot = {
  as_of: AS_OF, customers_simulated: 1000, months: 24,
  assumptions: { adoption_rate: 0.6, outreach_lead_days: 90, hardship_uptake: 0.5 },
  baseline: { retention_rate: 0.52, calls_per_100_customers: 38, delinquency_rate: 0.041, revenue: 18_400_000, cost_to_serve: 1_250_000, avg_ltv: 9200, loyalty_revenue: 3_100_000 },
  nextmove: { retention_rate: 0.61, calls_per_100_customers: 27, delinquency_rate: 0.029, revenue: 20_900_000, cost_to_serve: 890_000, avg_ltv: 10650, loyalty_revenue: 4_350_000 },
  series: Array.from({ length: 24 }, (_, m) => ({ month: m + 1, baseline_retention: 0.52, nextmove_retention: Math.round((0.52 + 0.09 * Math.min(1, (m + 1) / 12)) * 1000) / 1000 })),
  maturity_pipeline: { d90: 41, d60: 33, d30: 27 },
};

export const traces: AgentTrace[] = [
  {
    id: "TR-0001", agent: "advisor", customer_id: "CUST-MARIA", session_id: "SES-01", started_at: ago(4), duration_ms: 3120,
    plan: ["Load contract", "Run lease-end scenarios", "Check market value", "Explain best option"],
    tool_calls: [
      { tool: "get_customer", input: { customer_id: "CUST-MARIA" }, output: { contract: "LSE-1001" }, duration_ms: 42 },
      { tool: "run_scenario", input: { customer_id: "CUST-MARIA" }, output: { buyout_total: 22750, return_fees: 3200 }, duration_ms: 118 },
      { tool: "get_market_value", input: { model: "RAV4", year: 2024 }, output: { estimated_value: 27300, source: "SerpApi (cached)" }, duration_ms: 64 },
    ],
    guardian: guardianPass, action: { type: "recommend", autonomy_level: "L1", status: "executed" }, model: "claude-sonnet-5-5", prompt_version: "advisor@v1",
  },
  {
    id: "TR-0003", agent: "hardship", customer_id: "CUST-PRIYA", started_at: ago(12), duration_ms: 2480,
    plan: ["Detect missed payment", "Check hardship eligibility", "Propose policy options", "Escalate deferral to human"],
    tool_calls: [
      { tool: "check_eligibility", input: { customer_id: "CUST-PRIYA", option: "due_date_change" }, output: { eligible: true }, duration_ms: 35 },
      { tool: "handoff_to_human", input: { customer_id: "CUST-PRIYA", reason: "deferral approval" }, output: { handoff_id: "HO-02" }, duration_ms: 51 },
    ],
    guardian: guardianPass, action: { type: "handoff", autonomy_level: "L4", status: "escalated" }, model: "claude-sonnet-5-5", prompt_version: "hardship@v1",
  },
  {
    id: "TR-0004", agent: "sentinel", started_at: ago(60), duration_ms: 9100, plan: ["Daily scan of 1,000 customers", "Rank queue"],
    tool_calls: [{ tool: "run_scenario", input: { batch: 1000 }, output: { triggers: 214 }, duration_ms: 8700 }],
    guardian: guardianPass, action: { type: "draft_outreach", autonomy_level: "L2", status: "executed" }, model: "claude-sonnet-5-5", prompt_version: "sentinel@v1",
  },
];

export const handoffs: Handoff[] = [
  { id: "HO-01", customer_id: "CUST-JAMES", reason: "Questions about hybrid trims", surface: "app", status: "waiting", context_summary: "Viewing upgrade recommendation", created_at: ago(3) },
  { id: "HO-02", customer_id: "CUST-PRIYA", reason: "Deferral approval + callback", surface: "app", status: "waiting", context_summary: "Hardship flow; due-date change accepted", created_at: ago(11) },
];

export const alerts: Alert[] = [
  { id: "AL-01", customer_id: "CUST-MARIA", type: "lease_end", title: "Your lease ends in 90 days", body: "See whether buying beats returning.", autonomy_level: "L3", status: "pending_approval", consent: true, drafted_by: "sentinel", trace_id: "TR-0004", created_at: ago(55) },
  { id: "AL-02", customer_id: "CUST-JAMES", type: "positive_equity", title: "You have equity in your Camry", body: "It could lower your monthly cost.", autonomy_level: "L3", status: "sent", consent: true, drafted_by: "sentinel", created_at: ago(2000) },
  { id: "AL-03", customer_id: "CUST-1004", type: "rate_drop", title: "Rates dropped", body: "Refinancing could lower your payment.", autonomy_level: "L2", status: "draft", consent: false, drafted_by: "sentinel", created_at: ago(50) },
];

export const dealPackets: DealPacket[] = [];
export const sessions: Session[] = [
  { id: "SES-01", customer_id: "CUST-MARIA", surface: "kiosk", started_at: ago(5), current_screen: "next-move", language: "en", last_trace_id: "TR-0001" },
  { id: "SES-02", customer_id: "CUST-JAMES", surface: "app", started_at: ago(3), current_screen: "showroom", language: "en" },
];

export const offers: Offer[] = [
  { id: "OF-01", name: "Lease-end loyalty: 0.5% off", rule: "lease_end AND days_to_maturity <= 90", target_situation: "lease_end", incentive: { type: "rate_reduction", value: 0.5 }, status: "active", created_at: ago(9000) },
  { id: "OF-02", name: "Lease-end loyalty: $500 cash", rule: "lease_end AND days_to_maturity <= 90", target_situation: "lease_end", incentive: { type: "cash", value: 500 }, status: "active", variant_of: "OF-01", created_at: ago(9000) },
  { id: "OF-03", name: "Hybrid switch credit", rule: "positive_equity AND powertrain = gas", target_situation: "ev_switch", incentive: { type: "loyalty_credit", value: 750 }, status: "draft", created_at: ago(400) },
];

export const audit: AuditEntry[] = [
  { id: "AU-01", at: ago(30), actor: "EMP-ADVISOR-1", action: "approve_recommendation", customer_id: "CUST-JAMES", autonomy_level: "L3", trace_id: "TR-0002" },
  { id: "AU-02", at: ago(12), actor: "hardship", action: "escalate_deferral", customer_id: "CUST-PRIYA", autonomy_level: "L4", detail: "Deferral requires human approval", trace_id: "TR-0003" },
];

export const fairness: FairnessReport = {
  as_of: AS_OF, threshold: 0.05,
  groups: [
    ...REGIONS.map((g, i) => ({ dimension: "region" as const, group: g, customers: 240 + i * 10, recommendation_rate: 0.31 + i * 0.01, offer_rate: 0.22 + i * 0.008, flagged: false })),
    ...(["A", "B", "C", "D"] as const).map((g, i) => ({ dimension: "credit_tier" as const, group: g, customers: 300 - i * 40, recommendation_rate: 0.33 - i * 0.01, offer_rate: 0.25 - i * 0.02, flagged: i === 3 })),
  ],
};

export const studioAgents: StudioAgent[] = [
  { id: "AG-advisor", name: "Advisor", template: "custom", tools: ["get_customer", "run_scenario", "check_eligibility", "get_market_value", "book_appointment"], status: "deployed", prompt_version: "advisor@v1", health: { runs_24h: 412, success_rate: 0.98, avg_latency_ms: 2900 }, deployed_at: ago(20000) },
  { id: "AG-sentinel", name: "Sentinel", template: "custom", tools: ["run_scenario", "create_offer_draft"], status: "deployed", prompt_version: "sentinel@v1", health: { runs_24h: 1, success_rate: 1, avg_latency_ms: 9100 }, deployed_at: ago(20000) },
  { id: "AG-hardship", name: "Hardship", template: "custom", tools: ["get_customer", "check_eligibility", "handoff_to_human"], status: "deployed", prompt_version: "hardship@v1", health: { runs_24h: 37, success_rate: 0.97, avg_latency_ms: 2500 }, deployed_at: ago(20000) },
];

export const inspectionFor = (customer_id: string): InspectionResult => ({
  id: `INS-${Date.now()}`, customer_id, is_estimate: true, created_at: new Date().toISOString(),
  disclaimer: "Estimate only. Final charges are set at the official lease-end inspection.",
  items: [
    { angle: "front", area: "Front bumper", issue: "Scratch, 3 in", severity: "minor", estimated_charge: 150, box: [0.42, 0.62, 0.18, 0.1] },
    { angle: "left", area: "Rear left door", issue: "Dent", severity: "moderate", estimated_charge: 250, box: [0.55, 0.4, 0.12, 0.14] },
    { angle: "wheels", area: "Front right wheel", issue: "Light curb rash", severity: "minor", estimated_charge: 0, box: [0.3, 0.3, 0.4, 0.4] },
  ],
  total_estimated_charge: 400,
});
