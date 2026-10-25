import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeId } from "./ids.ts";

test("every way of typing an ID reaches the same account", () => {
  for (const typed of ["vishwaa 2026", "vishwaa-2026", "cust-vishwaa2026", "  CUST VISHWAA2026 "]) {
    assert.equal(normalizeId(typed), "CUST-VISHWAA2026", typed);
  }
  assert.equal(normalizeId("1004"), "CUST-1004");
  assert.equal(normalizeId("CUST-1004"), "CUST-1004");
  assert.equal(normalizeId("   "), "");
});
