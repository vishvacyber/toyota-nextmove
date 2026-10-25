import { test } from "node:test";
import assert from "node:assert/strict";
import type { Handoff } from "@nextmove/contracts";
import { upsertById } from "./upsert.ts";

const h = (id: string, status: Handoff["status"] = "waiting"): Handoff =>
  ({ id, customer_id: "CUST-VISHWAA2026", reason: "r", surface: "kiosk", status, created_at: "2026-10-24T09:00:00Z" });

test("prepends a new handoff", () => {
  assert.deepEqual(upsertById([h("A")], h("B")).map((x) => x.id), ["B", "A"]);
});

test("replaces an existing handoff in place", () => {
  const out = upsertById([h("A"), h("B")], h("B", "claimed"));
  assert.deepEqual(out.map((x) => [x.id, x.status]), [["A", "waiting"], ["B", "claimed"]]);
});

test("a seed overlapping live items does not duplicate", () => {
  assert.deepEqual([h("A"), h("B")].reduce(upsertById, [h("B")]).map((x) => x.id), ["A", "B"]);
});
