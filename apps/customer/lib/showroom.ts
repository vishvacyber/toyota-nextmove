import type { Customer, Recommendation, Scenario, Vehicle } from "@nextmove/contracts";

export const PARTS = ["body", "powertrain", "battery", "chassis", "interior"] as const;
export type Part = (typeof PARTS)[number];

/** Where each part ends up at full explode (t = 1), in scene units. */
const EXPLODE: Record<Part, [number, number, number]> = {
  body: [0, 1.2, 0],
  powertrain: [1.5, 0.3, 0],
  battery: [0, -0.7, 0],
  chassis: [0, -0.3, 0],
  interior: [0, 0.5, 1.3],
};

export function offset(part: Part, t: number): [number, number, number] {
  const [x, y, z] = EXPLODE[part];
  return [x * t, y * t, z * t];
}

export type TrimOption = { key: string; vehicle: Vehicle; scenario?: Scenario };

/** Trims come only from data: the customer's car (priced by `keep`) and every scenario's target vehicle. */
export function trims(c: Customer, r: Recommendation): TrimOption[] {
  const all = [r.recommended, ...r.alternatives];
  const out: TrimOption[] = [{ key: "current", vehicle: c.vehicle, scenario: all.find((s) => s.option === "keep") }];
  for (const s of all) if (s.target_vehicle) out.push({ key: s.option, vehicle: s.target_vehicle, scenario: s });
  return out;
}

/** Cosmetic paint swatches; color doesn't change any engine number. */
export const COLORS = [
  { name: "Supersonic Red", hex: "#b3121b" },
  { name: "Midnight Black", hex: "#16171a" },
  { name: "Wind Chill Pearl", hex: "#e9e9e4" },
  { name: "Celestial Silver", hex: "#9aa0a6" },
  { name: "Reservoir Blue", hex: "#1f3a5f" },
] as const;
