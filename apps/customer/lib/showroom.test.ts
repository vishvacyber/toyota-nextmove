import { test } from "node:test";
import assert from "node:assert/strict";
import type { Customer, Recommendation } from "@nextmove/contracts";
import { offset, trims } from "./showroom.ts";

test("explode offset scales the part's vector", () => {
  assert.deepEqual(offset("body", 0), [0, 0, 0]);
  assert.deepEqual(offset("powertrain", 1), [1.5, 0.3, 0]);
});

const car = { model: "Camry", trim: "SE" };
const hybrid = { model: "Camry", trim: "SE Hybrid" };
const keep = { option: "keep", monthly_payment: 465 };
const upgrade = { option: "upgrade", monthly_payment: 422, target_vehicle: hybrid };
const c = { vehicle: car } as unknown as Customer;

test("trims: current car priced by keep, plus each target vehicle", () => {
  const r = { recommended: upgrade, alternatives: [keep] } as unknown as Recommendation;
  assert.deepEqual(trims(c, r).map((o) => [o.vehicle.trim, o.scenario?.monthly_payment]), [["SE", 465], ["SE Hybrid", 422]]);
});

test("trims: no keep scenario means no price for the current car", () => {
  const r = { recommended: { option: "buyout", monthly_payment: 400 }, alternatives: [] } as unknown as Recommendation;
  assert.deepEqual(trims(c, r).map((o) => [o.vehicle.trim, o.scenario]), [["SE", undefined]]);
});
