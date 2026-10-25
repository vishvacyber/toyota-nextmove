import type { KpiSnapshot } from "@nextmove/contracts";
import { pct, usd } from "@/lib/format";

export type Metric = keyof KpiSnapshot["baseline"];
// lower: true means a drop is the good direction.
export const KPIS: { key: Metric; title: string; fmt: (n: number) => string; lower?: boolean }[] = [
  { key: "retention_rate", title: "Retention", fmt: (n) => pct(n, 1) },
  { key: "calls_per_100_customers", title: "Calls / 100 customers", fmt: (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 }), lower: true },
  { key: "delinquency_rate", title: "Delinquency", fmt: (n) => pct(n, 1), lower: true },
  { key: "revenue", title: "Revenue", fmt: usd },
  { key: "cost_to_serve", title: "Cost to serve", fmt: usd, lower: true },
  { key: "avg_ltv", title: "Avg. lifetime value", fmt: usd },
];

/** Source line for every KPI number (CLAUDE.md rule 10). */
export const kpiSource = (k: KpiSnapshot) =>
  `Source: portfolio simulation (${k.customers_simulated.toLocaleString()} customers, ${k.months} months)`;
