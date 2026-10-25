"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Customer, Opportunity, Recommendation } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ScenarioTable } from "@/components/scenario-table";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asOf, label, pct, usd } from "@/lib/format";

// shortcut: risk bands are display thresholds on the API's risk_score, move them to the engine if they ever drive actions.
const riskBand = (r: number) => (r >= 0.6 ? "High" : r >= 0.3 ? "Medium" : "Low");

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

export default function Customer360() {
  const { id } = useParams<{ id: string }>();
  const cust = useApi<Customer>(`/customers/${id}`);
  const rec = useApi<Recommendation>(`/customers/${id}/recommendation`);
  const opps = useApi<Opportunity[]>("/opportunities");
  const c = cust.data;
  const r = rec.data;
  const opp = opps.data?.find((o) => o.customer_id === id);

  if (!c) return <ApiState loading={cust.loading} error={cust.error} />;
  const k = c.contract;
  const lease = k.type === "lease";
  const timeline = [...c.payment_history].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/customers" className="hover:underline">Customers</Link> / <span className="font-mono">{c.id}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{c.first_name} {c.last_name}</h1>
        <Badge variant="outline">{label(c.situation)}</Badge>
        <Badge variant={k.status === "current" ? "secondary" : "destructive"}>{label(k.status)}</Badge>
      </div>

      {opp && (
        <Card size="sm" className="ring-primary/40">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span><span className="text-muted-foreground">Why queued: </span><span className="font-medium">{opp.reason}</span></span>
            <span><span className="text-muted-foreground">Priority </span>P{opp.priority}</span>
            <span><span className="text-muted-foreground">Value </span><span className="tabular-nums">{usd(opp.expected_value)}</span></span>
            <span><span className="text-muted-foreground">Retention odds </span><span className="tabular-nums">{pct(opp.retention_odds)}</span></span>
            <span className="basis-full italic text-muted-foreground">Script: “{opp.script}”</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field k="Customer ID"><span className="font-mono">{c.id}</span></Field>
              <Field k="Region">{c.region}</Field>
              <Field k="Language">{c.preferred_language.toUpperCase()}</Field>
              <Field k="Pay frequency">{label(c.pay_frequency)}</Field>
              <Field k="Next payday">{c.next_payday ?? "—"}</Field>
              <Field k="Vehicle">{c.vehicle.year} {c.vehicle.model} {c.vehicle.trim}</Field>
              <Field k="Powertrain">{label(c.vehicle.powertrain)}</Field>
              <Field k="Odometer">{c.vehicle.odometer_miles.toLocaleString()} mi</Field>
            </dl>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader><CardTitle>Contract</CardTitle><CardDescription className="font-mono">{k.id}</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field k="Type">{label(k.type)}</Field>
              <Field k="Monthly payment">{usd(k.monthly_payment)}</Field>
              <Field k="APR">{k.apr}%</Field>
              <Field k="Payments">{k.payments_made} / {k.term_months}</Field>
              <Field k="Maturity">{k.maturity_date}</Field>
              <Field k="Due day">{k.due_day}</Field>
              <Field k="Payoff">{usd(k.payoff_amount)}</Field>
              {lease && k.residual_value !== undefined && <Field k="Residual">{usd(k.residual_value)}</Field>}
              {lease && k.annual_mile_allowance !== undefined && <Field k="Mile allowance">{k.annual_mile_allowance.toLocaleString()} / yr</Field>}
              {lease && k.projected_miles_at_maturity !== undefined && <Field k="Projected miles">{k.projected_miles_at_maturity.toLocaleString()}</Field>}
            </dl>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader><CardTitle>Risk</CardTitle><CardDescription>Payment-stress score</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{pct(c.risk_score)}</span>
              <Badge variant={riskBand(c.risk_score) === "High" ? "destructive" : "secondary"}>{riskBand(c.risk_score)}</Badge>
            </div>
            <div className="h-2 rounded bg-muted" aria-hidden>
              <div className={riskBand(c.risk_score) === "High" ? "h-2 rounded bg-destructive" : "h-2 rounded bg-foreground/60"} style={{ width: pct(c.risk_score) }} />
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Field k="Days past due">{k.days_past_due}</Field>
              <Field k="Credit tier">{c.credit_tier}</Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card size="sm" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Current recommendation</CardTitle>
            {r && <CardDescription>Engine output · generated {asOf(r.generated_at)}{r.trace_id && <> · trace <span className="font-mono">{r.trace_id}</span></>}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ApiState loading={rec.loading} error={rec.error} />
            {r && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold">{r.headline}</p>
                  <Badge variant={r.guardian.verdict === "pass" ? "secondary" : "destructive"}>Guardian: {r.guardian.verdict}</Badge>
                  {r.review?.status && <Badge variant="outline">Review: {r.review.status}</Badge>}
                </div>
                <p className="text-muted-foreground">{r.why}</p>
                <ScenarioTable recommended={r.recommended} others={[...r.alternatives, ...(r.baseline ? [r.baseline] : [])]} />
                {r.why_not.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {r.why_not.map((w) => <li key={w.option}><span className="text-foreground">Not {label(w.option)}:</span> {w.reason}</li>)}
                  </ul>
                )}
                <p>
                  <span className="text-muted-foreground">Next action: </span>{r.action.label}{" "}
                  <Badge variant="outline">{r.action.autonomy_level}</Badge>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader><CardTitle>Timeline</CardTitle><CardDescription>Payments and life events</CardDescription></CardHeader>
          <CardContent>
            <ol className="space-y-2 border-l pl-4 text-sm">
              {c.life_events.map((e) => (
                <li key={e} className="relative">
                  <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" aria-hidden />
                  <span className="font-medium">Life event: {label(e)}</span>
                </li>
              ))}
              {timeline.map((p) => (
                <li key={p.date} className="relative flex justify-between gap-2">
                  <span className={`absolute top-1.5 -left-[21px] size-2 rounded-full ${p.status === "paid" ? "bg-muted-foreground" : "bg-destructive"}`} aria-hidden />
                  <span><span className="tabular-nums">{p.date}</span> · {label(p.status)}</span>
                  <span className="tabular-nums">{usd(p.amount)}</span>
                </li>
              ))}
              {!c.life_events.length && !timeline.length && <li className="text-muted-foreground">No events.</li>}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
