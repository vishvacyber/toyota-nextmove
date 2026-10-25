// Every contract endpoint must have a working mock (Stage 0 "Done when").
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupServer } from "msw/node";
import { activeHandlers, handlers } from "./handlers";

const server = setupServer(...handlers);
before(() => server.listen({ onUnhandledRequest: "error" }));
after(() => server.close());

const API = "http://localhost:8000";
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const calls: [string, string, RequestInit?][] = [
  ["GET /health", "/health"],
  ["GET /customers", "/customers?q=vishwaa"],
  ["GET /customers/{id}", "/customers/CUST-SAMEERA2026"],
  ["GET /customers/{id}/recommendation", "/customers/CUST-HUNG2026/recommendation"],
  ["POST /customers/{id}/recommendation/review", "/customers/CUST-VISHWAA2026/recommendation/review", json({ decision: "override", reviewer: "EMP-1", override_option: "return", reason: "test" })],
  ["POST /customers/{id}/actions", "/customers/CUST-HUNG2026/actions", json({ type: "due_date_change", option: "due_date_change", detail: "the 17th" })],
  ["GET /customers/{id}/timing", "/customers/CUST-SAMEERA2026/timing"],
  ["POST /scenarios", "/scenarios", json({ customer_id: "CUST-VISHWAA2026" })],
  ["POST /agents/advisor/ask", "/agents/advisor/ask", json({ customer_id: "CUST-VISHWAA2026", message: "What should I do at lease end?" })],
  ["POST /inspections", "/inspections", (() => { const f = new FormData(); f.set("customer_id", "CUST-VISHWAA2026"); f.append("photos", new Blob(["x"]), "front.jpg"); return { method: "POST", body: f }; })()],
  ["POST /estimate", "/estimate", json({ models: ["Camry", "bZ"], trade_in: { model: "RAV4", year: 2020, odometer_miles: 50000, payoff: 8000 } })],
  ["GET /calls", "/calls"],
  ["POST /calls/{id}/takeover", "/calls/CALL-01/takeover", json({ employee: "Alex" })],
  ["POST /calls/{id}/messages", "/calls/CALL-01/messages", json({ text: "Hi Vishwaa" })],
  ["GET /handoffs", "/handoffs"],
  ["POST /handoffs", "/handoffs", json({ customer_id: "CUST-HUNG2026", reason: "callback", surface: "app" })],
  ["PATCH /handoffs/{id}", "/handoffs/HO-01", { ...json({ status: "claimed", claimed_by: "EMP-1" }), method: "PATCH" }],
  ["GET /deal-packets", "/deal-packets"],
  ["POST /deal-packets", "/deal-packets", json({ customer_id: "CUST-SAMEERA2026", option: "upgrade" })],
  ["GET /alerts", "/alerts?status=pending_approval"],
  ["PATCH /alerts/{id}", "/alerts/AL-01", { ...json({ status: "approved", actor: "EMP-1" }), method: "PATCH" }],
  ["GET /sessions", "/sessions"],
  ["GET /opportunities", "/opportunities"],
  ["GET /offers", "/offers"],
  ["POST /offers", "/offers", json({ name: "Test", rule: "lease_end", incentive: { type: "cash", value: 100 } })],
  ["POST /offers/{id}/simulate", "/offers/OF-01/simulate", { method: "POST" }],
  ["GET /kpis", "/kpis?adoption_rate=0.3"],
  ["GET /traces", "/traces"],
  ["GET /audit", "/audit"],
  ["GET /fairness", "/fairness"],
  ["GET /market/{model}", "/market/RAV4"],
  ["GET /studio/agents", "/studio/agents"],
  ["POST /studio/agents", "/studio/agents", json({ name: "Recall Notifier", template: "recall_notifier", tools: ["get_recalls"] })],
  ["POST /studio/agents/{id}/deploy", "/studio/agents/AG-advisor/deploy", { method: "POST" }],
];

test("every openapi operation is exercised here", () => {
  const spec = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8");
  const ops: string[] = [];
  let path = "";
  for (const line of spec.split("\n")) {
    const p = line.match(/^ {2}(\/\S*):$/);
    if (p) path = p[1];
    const m = line.match(/^ {4}(get|post|patch|put|delete):/);
    if (m && path) ops.push(`${m[1].toUpperCase()} ${path}`);
  }
  assert.deepEqual(ops.sort(), calls.map((c) => c[0]).sort());
});

for (const [name, path, init] of calls) {
  test(name, async () => {
    const res = await fetch(API + path, init);
    assert.ok(res.ok, `${name} → ${res.status}`);
    assert.ok(await res.json());
  });
}

test("personas resolve with the right recommendation", async () => {
  const get = (id: string) => fetch(`${API}/customers/${id}/recommendation`).then((r) => r.json());
  assert.equal((await get("CUST-VISHWAA2026")).recommended.option, "buyout");
  assert.equal((await get("CUST-SAMEERA2026")).recommended.option, "upgrade");
  assert.equal((await get("CUST-HUNG2026")).recommended.option, "due_date_change");
  assert.equal((await fetch(`${API}/customers`).then((r) => r.json())).length, 23);
});

test("kpi mock moves with adoption rate", async () => {
  const k = (a: number) => fetch(`${API}/kpis?adoption_rate=${a}`).then((r) => r.json());
  assert.ok((await k(0.9)).nextmove.retention_rate > (await k(0.3)).nextmove.retention_rate);
});

test("activeHandlers keeps only the listed path prefixes", () => {
  assert.equal(activeHandlers("enabled").length, handlers.length);
  assert.equal(activeHandlers(undefined).length, handlers.length);
  const kpis = activeHandlers("/kpis, /fairness").map((h) => ("path" in h.info ? String(h.info.path) : ""));
  assert.deepEqual(kpis.sort(), ["*/fairness", "*/kpis"]);
});
