import type { EstimateRequest, Model } from "@nextmove/contracts";

/** Walk-in inputs, short enough for a QR: the phone summary page re-asks the engine, so no numbers ride in the URL. */
export type Inputs = Required<Pick<EstimateRequest, "models" | "down_payment" | "term_months">> & {
  credit_tier: NonNullable<EstimateRequest["credit_tier"]>;
  trade_in?: EstimateRequest["trade_in"];
};

const MODELS: Model[] = ["Camry", "RAV4", "Tacoma", "Highlander", "Prius", "bZ"];
const TIERS = ["A", "B", "C", "D"] as const;
const int = (s: string | null, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(s));
  return s !== null && Number.isFinite(n) && n >= lo && n <= hi ? n : d;
};

export const DEFAULTS: Inputs = { models: ["Camry"], down_payment: 2000, term_months: 60, credit_tier: "B" };

export function toQuery(i: Inputs): string {
  const q = new URLSearchParams({ m: i.models.join(","), d: String(i.down_payment), n: String(i.term_months), c: i.credit_tier });
  if (i.trade_in) q.set("t", [i.trade_in.model, i.trade_in.year, i.trade_in.odometer_miles, i.trade_in.payoff].join(","));
  return q.toString();
}

/** Untrusted (a scanned URL): anything unknown or out of range falls back to the defaults. */
export function fromQuery(q: URLSearchParams): Inputs {
  const models = (q.get("m") ?? "").split(",").filter((m): m is Model => MODELS.includes(m as Model)).slice(0, 3);
  const c = q.get("c");
  const t = (q.get("t") ?? "").split(",");
  const i: Inputs = {
    models: models.length ? [...new Set(models)] : DEFAULTS.models,
    down_payment: int(q.get("d"), 0, 100_000, DEFAULTS.down_payment),
    term_months: int(q.get("n"), 24, 84, DEFAULTS.term_months),
    credit_tier: TIERS.find((x) => x === c) ?? DEFAULTS.credit_tier,
  };
  if (t.length === 4 && MODELS.includes(t[0] as Model)) {
    i.trade_in = { model: t[0] as Model, year: int(t[1], 2005, 2027, 2020), odometer_miles: int(t[2], 0, 400_000, 40_000),
                   payoff: int(t[3], 0, 200_000, 0) };
  }
  return i;
}
