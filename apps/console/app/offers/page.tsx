"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { components, Offer, OfferSimulation } from "@nextmove/contracts";
import { api, useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { label, pct, usd } from "@/lib/format";
import { MockBadge } from "@/components/mock-provider";

type OfferCreate = components["schemas"]["OfferCreate"];
type Incentive = Offer["incentive"]["type"];
const INCENTIVES: Incentive[] = ["rate_reduction", "cash", "loyalty_credit", "fee_waiver"];
const SITUATIONS: components["schemas"]["Situation"][] = ["lease_end", "mileage_overage", "positive_equity", "rate_drop", "early_payoff", "life_event", "payment_stress", "ev_switch"];
const incentive = ({ type, value }: Offer["incentive"]) => (type === "rate_reduction" ? `${value}% APR off` : `${usd(value)} ${label(type).toLowerCase()}`);
const selectCls = "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30 focus-visible:outline-2 focus-visible:outline-ring";

const chartConfig = { expected_profit: { label: "Expected profit", color: "var(--chart-1)" } } satisfies ChartConfig;

export default function OfferStudio() {
  const { data, error, loading } = useApi<Offer[]>("/offers");
  const [created, setCreated] = useState<Offer[]>([]);
  const [sim, setSim] = useState<OfferSimulation>();
  const [busy, setBusy] = useState<string>();
  const toast = useToast();
  const offers = [...created, ...(data ?? [])];
  const ids = new Set(offers.map((o) => o.id));
  const parents = offers.filter((o) => !o.variant_of || !ids.has(o.variant_of));
  const rows = parents.flatMap((p) => [p, ...offers.filter((o) => o.variant_of === p.id)]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e) { toast(`Action failed: ${(e as Error).message}`, true); } finally { setBusy(undefined); }
  }

  function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body: OfferCreate = {
      name: String(f.get("name")),
      rule: String(f.get("rule")),
      incentive: { type: f.get("type") as Incentive, value: Number(f.get("value")) },
      ...(f.get("situation") ? { target_situation: f.get("situation") as OfferCreate["target_situation"] } : {}),
      ...(f.get("variant_of") ? { variant_of: String(f.get("variant_of")) } : {}),
    };
    run("create", async () => {
      const o = await api<Offer>("/offers", { method: "POST", body: JSON.stringify(body) });
      setCreated((c) => [o, ...c]);
      form.reset();
      toast(`Created offer ${o.name}`);
    });
  }

  const simulate = (o: Offer) => run(o.id, async () => setSim(await api<OfferSimulation>(`/offers/${o.id}/simulate`, { method: "POST" })));
  const leader = sim && Math.max(...sim.variants.map((v) => v.expected_profit));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">Offer Studio <MockBadge path="/offers" /></h1>
        <p className="text-sm text-muted-foreground">Eligibility rules and incentives. Add a variant to A/B test an offer, then simulate it against the synthetic portfolio.</p>
      </div>
      <ApiState loading={loading} error={error} />

      <Card>
        <CardHeader>
          <CardTitle>Offers</CardTitle>
          <CardDescription>{offers.length} offers · variants are listed under the offer they test against</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Incentive</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">A/B</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className={o.variant_of ? "pl-6" : "font-medium"}>
                    {o.variant_of && <span aria-hidden className="mr-1 text-muted-foreground">↳</span>}
                    {o.name} <span className="font-mono text-xs text-muted-foreground">{o.id}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{o.rule}</TableCell>
                  <TableCell>{o.target_situation ? label(o.target_situation) : "—"}</TableCell>
                  <TableCell>{incentive(o.incentive)}</TableCell>
                  <TableCell><Badge variant={o.status === "active" ? "secondary" : "outline"}>{label(o.status)}</Badge></TableCell>
                  <TableCell className="text-right">
                    {o.variant_of ? (
                      <Badge variant="outline">Variant of {o.variant_of}</Badge>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy === o.id} onClick={() => simulate(o)} aria-label={`Simulate ${o.name}`}>
                        {busy === o.id ? "Simulating…" : "Simulate"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {sim && (
        <Card aria-live="polite">
          <CardHeader>
            <CardTitle>Simulation · {offers.find((o) => o.id === sim.offer_id)?.name ?? sim.offer_id}</CardTitle>
            <CardDescription>Source: offer simulation over the synthetic portfolio · {sim.customers_targeted.toLocaleString()} customers targeted · {sim.variants.length > 1 ? `${sim.variants.length} variants (A/B)` : "no variants yet; add one to A/B test"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Acceptance</TableHead>
                  <TableHead className="text-right">Expected profit</TableHead>
                  <TableHead className="text-right">Retention lift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sim.variants.map((v, i) => (
                  <TableRow key={v.name}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + i)}</span> {v.name}
                      {sim.variants.length > 1 && v.expected_profit === leader && <Badge className="ml-2">Leader</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pct(v.acceptance_rate, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(v.expected_profit)}</TableCell>
                    <TableCell className="text-right tabular-nums">+{(v.retention_lift * 100).toFixed(1)} pts</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ChartContainer config={chartConfig} className="h-48 w-full" aria-label="Bar chart of expected profit by variant">
              <BarChart data={sim.variants.map((v, i) => ({ ...v, variant: String.fromCharCode(65 + i) }))} margin={{ left: 4, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="variant" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={usd} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => p[0]?.payload.name} formatter={(v) => <span className="font-mono tabular-nums">{usd(Number(v))}</span>} />} />
                <Bar dataKey="expected_profit" fill="var(--color-expected_profit)" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New offer or variant</CardTitle>
          <CardDescription>New offers start as drafts. Pick &ldquo;Variant of&rdquo; to A/B test against an existing offer.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">Name<Input name="name" required placeholder="Lease-end loyalty: $750 cash" /></label>
            <label className="space-y-1 text-sm">Eligibility rule<Input name="rule" required placeholder="lease_end AND days_to_maturity <= 90" className="font-mono" /></label>
            <label className="space-y-1 text-sm">Target situation
              <select name="situation" className={selectCls} defaultValue="">
                <option value="">Any</option>
                {SITUATIONS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">Incentive type
              <select name="type" className={selectCls} defaultValue="cash">
                {INCENTIVES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">Incentive value ($, or % APR for rate reduction)<Input name="value" type="number" required min={0} step="any" /></label>
            <label className="space-y-1 text-sm">Variant of
              <select name="variant_of" className={selectCls} defaultValue="">
                <option value="">None (new offer)</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={busy === "create"}>{busy === "create" ? "Saving…" : "Save draft"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
