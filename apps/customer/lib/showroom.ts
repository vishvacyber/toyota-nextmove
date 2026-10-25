import type { Customer, Recommendation, Scenario, Vehicle } from "@nextmove/contracts";

/** What the showroom explains about each car. */
export const FEATURES = ["powertrain", "battery", "body", "chassis", "interior"] as const;
export type Feature = (typeof FEATURES)[number];

export type TrimOption = { key: string; vehicle: Vehicle; scenario?: Scenario };

/** Trims come only from data: the customer's car (priced by `keep`) and every scenario's target vehicle. */
export function trims(c: Customer, r: Recommendation): TrimOption[] {
  const all = [r.recommended, ...r.alternatives];
  const out: TrimOption[] = [{ key: "current", vehicle: c.vehicle, scenario: all.find((s) => s.option === "keep") }];
  for (const s of all) if (s.target_vehicle) out.push({ key: s.option, vehicle: s.target_vehicle, scenario: s });
  return out;
}
