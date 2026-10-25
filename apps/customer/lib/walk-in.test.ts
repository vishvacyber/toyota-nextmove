import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, fromQuery, toQuery, type Inputs } from "./walk-in.ts";

test("inputs survive the QR round trip", () => {
  const i: Inputs = { models: ["Camry", "bZ"], down_payment: 3000, term_months: 48, credit_tier: "A",
                      trade_in: { model: "RAV4", year: 2020, odometer_miles: 52000, payoff: 8000 } };
  assert.deepEqual(fromQuery(new URLSearchParams(toQuery(i))), i);
});

test("a tampered URL falls back to safe defaults", () => {
  const i = fromQuery(new URLSearchParams("m=Supra,Camry,Camry&d=-5&n=999&c=Z&t=Ferrari,1,2,3"));
  assert.deepEqual(i, { ...DEFAULTS, models: ["Camry"] });
  assert.deepEqual(fromQuery(new URLSearchParams("")), DEFAULTS);
});
