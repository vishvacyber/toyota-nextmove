import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mocked } from "./mocking.ts";

test("exact entries mock only that path, prefixes cover sub-paths", () => {
  const s = "/customers$,/customers/:id$,/handoffs,/kpis";
  assert.equal(mocked("/customers", s), true);
  assert.equal(mocked("/customers/:id", s), true);
  assert.equal(mocked("/customers/:id/recommendation", s), false);
  assert.equal(mocked("/handoffs/:id", s), true);
  assert.equal(mocked("/opportunities", s), false);
  assert.equal(mocked("/anything", "enabled"), true);
  assert.equal(mocked("/kpis", "disabled"), false);
});
