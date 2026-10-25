import { test } from "node:test";
import assert from "node:assert/strict";
import { actionStatus, TEMPLATES, TOOLS } from "./trust.ts";

test("L4 actions always read as escalated to a human", () => {
  assert.equal(actionStatus({ type: "defer", autonomy_level: "L4", status: "executed" }), "Escalated to human");
  assert.equal(actionStatus({ type: "recommend", autonomy_level: "L1", status: "executed" }), "Executed");
  assert.equal(actionStatus({ type: "alert", autonomy_level: "L3", status: "pending_approval" }), "Pending approval");
});

test("template tools come from the SPEC tool registry", () => {
  for (const t of Object.values(TEMPLATES)) for (const tool of t.tools) assert.ok((TOOLS as readonly string[]).includes(tool), tool);
});
