// Every contract endpoint must have a working mock (Stage 0 "Done when").
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
before(() => server.listen({ onUnhandledRequest: "error" }));
after(() => server.close());

const API = "http://localhost:8000";
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const calls: [string, string, RequestInit?][] = [
  ["GET /health", "/health"],
  ["GET /customers", "/customers?q=maria"],
  ["GET /customers/{id}", "/customers/CUST-JAMES"],
  ["GET /customers/{id}/recommendation", "/customers/CUST-PRIYA/recommendation"],
  ["POST /customers/{id}/recommendation/review", "/customers/CUST-MARIA/recommendation/review", json({ decision: "override", reviewer: "EMP-1", override_option: "return", reason: "test" })],
  ["GET /customers/{id}/timing", "/customers/CUST-JAMES/timing"],
  ["POST /scenarios", "/scenarios", json({ customer_id: "CUST-MARIA" })],
  ["POST /agents/advisor/ask", "/agents/advisor/ask", json({ customer_id: "CUST-MARIA", message: "What should I do at lease end?" })],
  ["POST /inspections", "/inspections", (() => { const f = new FormData(); f.set("customer_id", "CUST-MARIA"); f.append("photos", new Blob(["x"]), "front.jpg"); return { method: "POST", body: f }; })()],
  ["GET /handoffs", "/handoffs"],
  ["POST /handoffs", "/handoffs", json({ customer_id: "CUST-PRIYA", reason: "callback", surface: "app" })],
  ["PATCH /handoffs/{id}", "/handoffs/HO-01", { ...json({ status: "claimed", claimed_by: "EMP-1" }), method: "PATCH" }],
  ["GET /deal-packets", "/deal-packets"],
  ["POST /deal-packets", "/deal-packets", json({ customer_id: "CUST-JAMES", option: "upgrade" })],
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
  assert.equal((await get("CUST-MARIA")).recommended.option, "buyout");
  assert.equal((await get("CUST-JAMES")).recommended.option, "upgrade");
  assert.equal((await get("CUST-PRIYA")).recommended.option, "due_date_change");
  assert.equal((await fetch(`${API}/customers`).then((r) => r.json())).length, 23);
});

test("kpi mock moves with adoption rate", async () => {
  const k = (a: number) => fetch(`${API}/kpis?adoption_rate=${a}`).then((r) => r.json());
  assert.ok((await k(0.9)).nextmove.retention_rate > (await k(0.3)).nextmove.retention_rate);
});
