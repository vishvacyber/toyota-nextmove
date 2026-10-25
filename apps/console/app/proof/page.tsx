"use client";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { KpiSnapshot } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { asOf, pct } from "@/lib/format";
import { KPIS, kpiSource, type Metric } from "@/lib/kpis";

type Assumptions = KpiSnapshot["assumptions"];

const SLIDERS: { key: keyof Assumptions; title: string; min: number; max: number; step: number; fmt: (n: number) => string }[] = [
  { key: "adoption_rate", title: "Customer adoption", min: 0, max: 1, step: 0.05, fmt: (n) => pct(n) },
  { key: "outreach_lead_days", title: "Outreach lead time", min: 30, max: 180, step: 15, fmt: (n) => `${n} days` },
  { key: "hardship_uptake", title: "Hardship-path uptake", min: 0, max: 1, step: 0.05, fmt: (n) => pct(n) },
];

const chartConfig = {
  baseline_retention: { label: "Baseline", color: "var(--chart-2)" },
  nextmove_retention: { label: "NextMove", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Display-only difference between two API numbers; rates read as percentage points.
function delta(key: Metric, d: number, fmt: (n: number) => string) {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  return key.endsWith("_rate") ? `${sign}${(Math.abs(d) * 100).toFixed(1)} pts` : `${sign}${fmt(Math.abs(d))}`;
}

export default function Proof() {
  const [a, setA] = useState<Assumptions>();
  const [query, setQuery] = useState<Assumptions>();
  useEffect(() => {
    const t = setTimeout(() => setQuery(a), 300);
    return () => clearTimeout(t);
  }, [a]);

  const path = query ? `/kpis?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}` : "/kpis";
  const kpis = useApi<KpiSnapshot>(path);
  // useApi clears data while a new request loads; keep the last snapshot on screen so sliders don't flicker.
  const [k, setK] = useState<KpiSnapshot>();
  if (kpis.data && kpis.data !== k) {
    setK(kpis.data);
    if (!a) setA(kpis.data.assumptions);
  }
  const updating = kpis.loading || (!!a && a !== query);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Proof</h1>
          <p className="text-sm text-muted-foreground">Baseline vs NextMove across the synthetic portfolio. Move an assumption to re-run the simulation.</p>
        </div>
        {k && <p className="text-xs text-muted-foreground">{kpiSource(k)} · as of {asOf(k.as_of)}</p>}
      </div>
      {!k && <ApiState loading={kpis.loading} error={kpis.error} />}

      {a && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Assumptions</CardTitle>
            <CardDescription aria-live="polite">{kpis.error ? <span className="text-destructive">{kpis.error.message}</span> : updating ? "Updating…" : "Up to date"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {SLIDERS.map((s) => (
              <label key={s.key} className="space-y-1.5 text-sm">
                <span className="flex justify-between">
                  <span>{s.title}</span>
                  <span className="font-medium tabular-nums">{s.fmt(a[s.key])}</span>
                </span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={a[s.key]}
                  aria-valuetext={s.fmt(a[s.key])}
                  onChange={(e) => setA({ ...a, [s.key]: Number(e.target.value) })}
                  className="w-full accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
              </label>
            ))}
            <p className="text-xs text-muted-foreground md:col-span-3">
              Lead time and hardship uptake are sent to the simulation but only move the numbers once the full portfolio simulation (B5) is live; adoption moves every KPI today.
            </p>
          </CardContent>
        </Card>
      )}

      {k && (
        <>
          <section aria-label="KPI deltas, baseline vs NextMove" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {KPIS.map(({ key, title, fmt, lower }) => {
              const base = k.baseline[key] ?? 0;
              const next = k.nextmove[key] ?? 0;
              const better = lower ? next < base : next > base;
              return (
                <Card key={key} size="sm">
                  <CardHeader>
                    <CardDescription>{title}</CardDescription>
                    <CardTitle className="flex items-baseline gap-2 text-2xl tabular-nums group-data-[size=sm]/card:text-2xl">
                      {fmt(next)}
                      <span className={better ? "text-sm text-foreground" : "text-sm text-destructive"}>{delta(key, next - base, fmt)}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Baseline <span className="tabular-nums text-foreground">{fmt(base)}</span></span>
                    <Badge variant={better ? "outline" : "destructive"}>{next === base ? "No change" : better ? "▲ Better" : "▼ Worse"}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Retention by month</CardTitle>
              <CardDescription>Baseline vs NextMove at {pct(k.assumptions.adoption_rate)} adoption, {k.months}-month simulation</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-64 w-full" aria-label="Line chart of monthly retention, baseline vs NextMove">
                <LineChart data={k.series} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(m) => `M${m}`} />
                  <YAxis tickLine={false} axisLine={false} width={44} domain={[(min: number) => Math.min(0.4, min), (max: number) => Math.max(0.7, max)]} tickFormatter={(v: number) => pct(v)} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `Month ${p[0]?.payload.month}`} formatter={(v, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig].label}</span>
                      <span className="font-mono tabular-nums">{pct(Number(v), 1)}</span>
                    </div>
                  )} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line dataKey="baseline_retention" stroke="var(--color-baseline_retention)" strokeWidth={2} dot={false} strokeDasharray="4 4" isAnimationActive={false} />
                  <Line dataKey="nextmove_retention" stroke="var(--color-nextmove_retention)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
