"use client";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { KpiSnapshot, Opportunity } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState, Empty } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { asOf, label, pct, usd } from "@/lib/format";
import { KPIS } from "@/lib/kpis";
import { MockBadge } from "@/components/mock-provider";

const chartConfig = {
  baseline_retention: { label: "Baseline", color: "var(--chart-2)" },
  nextmove_retention: { label: "NXT", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function CommandCenter() {
  const kpis = useApi<KpiSnapshot>("/kpis");
  const opps = useApi<Opportunity[]>("/opportunities");
  const k = kpis.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Command Center</h1>
        {k && (
          <p className="text-xs text-muted-foreground">
            Source: portfolio simulation ({k.customers_simulated.toLocaleString()} customers, {k.months} months) · as of {asOf(k.as_of)} <MockBadge path="/kpis" />
          </p>
        )}
      </div>
      <ApiState loading={kpis.loading} error={kpis.error} />

      {k && (
        <>
          <section aria-label="KPIs, baseline vs NXT" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {KPIS.map(({ key, title, fmt, lower }) => {
              const base = k.baseline[key] ?? 0;
              const next = k.nextmove[key] ?? 0;
              const better = lower ? next < base : next > base;
              return (
                <Card key={key} size="sm">
                  <CardHeader>
                    <CardDescription>{title}</CardDescription>
                    <CardTitle className="text-2xl tabular-nums group-data-[size=sm]/card:text-2xl">{fmt(next)}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Baseline <span className="tabular-nums text-foreground">{fmt(base)}</span></span>
                    <Badge variant={better ? "outline" : "destructive"}>{better ? "▲ Better" : "▼ Worse"} with NXT</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Retention by month</CardTitle>
                <CardDescription>Baseline vs NXT, {k.months}-month simulation</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-64 w-full" aria-label="Line chart of monthly retention, baseline vs NXT">
                  <LineChart data={k.series} margin={{ left: 4, right: 12 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(m) => `M${m}`} />
                    <YAxis tickLine={false} axisLine={false} width={44} domain={["dataMin - 0.02", "dataMax + 0.02"]} tickFormatter={(v: number) => pct(v)} />
                    <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `Month ${p[0]?.payload.month}`} formatter={(v, name) => (
                      <div className="flex w-full justify-between gap-4">
                        <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig].label}</span>
                        <span className="font-mono tabular-nums">{pct(Number(v), 1)}</span>
                      </div>
                    )} />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line dataKey="baseline_retention" stroke="var(--color-baseline_retention)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                    <Line dataKey="nextmove_retention" stroke="var(--color-nextmove_retention)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Maturity pipeline</CardTitle>
                <CardDescription>Contracts maturing within</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {([["90 days", k.maturity_pipeline.d90], ["60 days", k.maturity_pipeline.d60], ["30 days", k.maturity_pipeline.d30]] as const).map(([name, n]) => (
                  <div key={name}>
                    <div className="flex justify-between text-sm">
                      <span>{name}</span>
                      <span className="font-medium tabular-nums">{n}</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-muted" aria-hidden>
                      <div className="h-2 rounded bg-primary" style={{ width: `${(n / k.maturity_pipeline.d90) * 100}%` }} />
                    </div>
                  </div>
                ))}
                <Link href="/queue" className="inline-block text-sm text-primary underline-offset-4 hover:underline">Work the queue →</Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top priority</CardTitle>
          <CardDescription>Priority 1 opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          <ApiState loading={opps.loading} error={opps.error} />
          <ul className="divide-y">
            {opps.data?.filter((o) => o.priority === 1).map((o) => (
              <li key={o.customer_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/customers/${o.customer_id}`} className="font-medium hover:underline">{o.customer_name}</Link>
                <span className="flex-1 text-muted-foreground">{o.reason}</span>
                <Badge variant="outline">{label(o.next_best_action)}</Badge>
                <span className="w-20 text-right tabular-nums">{usd(o.expected_value)}</span>
              </li>
            ))}
          </ul>
          {opps.data && !opps.data.some((o) => o.priority === 1) && <Empty>No priority 1 opportunities right now.</Empty>}
        </CardContent>
      </Card>
    </div>
  );
}
