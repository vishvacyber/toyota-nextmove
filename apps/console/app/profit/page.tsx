"use client";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { KpiSnapshot } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { asOf, pct, usd } from "@/lib/format";
import { kpiSource } from "@/lib/kpis";
import { MockBadge } from "@/components/mock-provider";

const chartConfig = {
  baseline: { label: "Baseline", color: "var(--chart-2)" },
  nextmove: { label: "NextMove", color: "var(--chart-1)" },
} satisfies ChartConfig;

const usdShort = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : usd(n));

export default function Profit() {
  const { data: k, error, loading } = useApi<KpiSnapshot>("/kpis");
  // Display-only differences between API numbers; nothing new is computed.
  const metrics = k && [
    { title: "Avg. lifetime value", sub: "per customer", base: k.baseline.avg_ltv, next: k.nextmove.avg_ltv, deltaLabel: "more per customer" },
    { title: "Loyalty revenue", sub: "repeat finance and lease", base: k.baseline.loyalty_revenue ?? 0, next: k.nextmove.loyalty_revenue ?? 0, deltaLabel: "more loyalty revenue" },
    { title: "Cost to serve", sub: "calls, collections, outreach", base: k.baseline.cost_to_serve, next: k.nextmove.cost_to_serve, deltaLabel: "saved", lower: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">Long-term Profit <MockBadge path="/kpis" /></h1>
          <p className="text-sm text-muted-foreground">What keeping customers in the Toyota family is worth over the simulation horizon.</p>
        </div>
        {k && <p className="text-xs text-muted-foreground">{kpiSource(k)} at {pct(k.assumptions.adoption_rate)} adoption · as of {asOf(k.as_of)}</p>}
      </div>
      <ApiState loading={loading} error={error} />

      {metrics && (
        <>
          <section aria-label="Long-term value, baseline vs NextMove" className="grid gap-3 md:grid-cols-3">
            {metrics.map((m) => {
              const d = m.lower ? m.base - m.next : m.next - m.base;
              return (
                <Card key={m.title} size="sm">
                  <CardHeader>
                    <CardDescription>{m.title} · {m.sub}</CardDescription>
                    <CardTitle className="text-2xl tabular-nums group-data-[size=sm]/card:text-2xl">{usdShort(m.next)}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Baseline <span className="tabular-nums text-foreground">{usdShort(m.base)}</span></span>
                    <span className={d >= 0 ? "font-medium text-foreground" : "font-medium text-destructive"}>{usdShort(d)} {m.deltaLabel}</span>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Portfolio value</CardTitle>
              <CardDescription>Loyalty revenue and cost to serve, baseline vs NextMove ({k.months} months)</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-64 w-full" aria-label="Bar chart of loyalty revenue and cost to serve, baseline vs NextMove">
                <BarChart data={metrics.slice(1).map((m) => ({ name: m.title, baseline: m.base, nextmove: m.next }))} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={usdShort} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig].label}</span>
                      <span className="font-mono tabular-nums">{usd(Number(v))}</span>
                    </div>
                  )} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="baseline" fill="var(--color-baseline)" radius={4} />
                  <Bar dataKey="nextmove" fill="var(--color-nextmove)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
