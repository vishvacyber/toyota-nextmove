import { test } from "node:test";
import assert from "node:assert/strict";
import type { Handoff } from "@nextmove/contracts";
import { upsertHandoff } from "./upsert.ts";

const h = (id: string, status: Handoff["status"] = "waiting"): Handoff =>
  ({ id, customer_id: "CUST-MARIA", reason: "r", surface: "kiosk", status, created_at: "2026-10-24T09:00:00Z" });

test("prepends a new handoff", () => {
  assert.deepEqual(upsertHandoff([h("A")], h("B")).map((x) => x.id), ["B", "A"]);
});

test("replaces an existing handoff in place", () => {
  const out = upsertHandoff([h("A"), h("B")], h("B", "claimed"));
  assert.deepEqual(out.map((x) => [x.id, x.status]), [["A", "waiting"], ["B", "claimed"]]);
});
