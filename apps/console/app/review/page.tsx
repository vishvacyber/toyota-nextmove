"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { AuditEntry, components, Opportunity, OptionType, Recommendation } from "@nextmove/contracts";
import { api, useApi } from "@nextmove/contracts/client";
import { ScenarioTable } from "@/components/scenario-table";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPLOYEE_ID } from "@/lib/employee";
import { asOf, label, pct, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

type RecommendationReview = components["schemas"]["RecommendationReview"];

export default function ReviewPage() {
  return <Suspense><Review /></Suspense>;
}

function Review() {
  const router = useRouter();
  const opps = useApi<Opportunity[]>("/opportunities");
  const list = opps.data ?? [];
  const id = useSearchParams().get("id") ?? list[0]?.customer_id;
  const opp = list.find((o) => o.customer_id === id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">NextMove Review</h1>
      <ApiState loading={opps.loading} error={opps.error} />
      <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
        <Card size="sm">
          <CardHeader><CardTitle>Queue</CardTitle><CardDescription>Pick a customer to review</CardDescription></CardHeader>
          <CardContent>
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto" aria-label="Customers to review">
              {list.map((o) => (
                <li key={o.customer_id}>
                  <button
                    type="button" onClick={() => router.replace(`/review?id=${o.customer_id}`)}
                    aria-current={o.customer_id === id ? "true" : undefined}
                    className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring", o.customer_id === id && "bg-muted")}
                  >
                    <span className="flex justify-between gap-2"><span className="font-medium">{o.customer_name}</span><span className="tabular-nums">{usd(o.expected_value)}</span></span>
                    <span className="block text-xs text-muted-foreground">P{o.priority} · {label(o.situation)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {id && <ReviewPanel key={id} id={id} opp={opp} />}
      </div>
    </div>
  );
}

function ReviewPanel({ id, opp }: { id: string; opp?: Opportunity }) {
  const rec = useApi<Recommendation>(`/customers/${id}/recommendation`);
  const r = rec.data;
  return (
    <div className="space-y-3">
      <ApiState loading={rec.loading} error={rec.error} />
      {r && (
        <>
          <Card size="sm">
            <CardHeader>
              <CardTitle>
                <Link href={`/customers/${id}`} className="hover:underline">{opp?.customer_name ?? id}</Link>{" "}
                <span className="font-mono text-xs text-muted-foreground">{id}</span>
              </CardTitle>
              <CardDescription>Engine output · generated {asOf(r.generated_at)}{r.trace_id && <> · trace <span className="font-mono">{r.trace_id}</span></>}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
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
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            <Card size="sm">
              <CardHeader><CardTitle>Internal value</CardTitle><CardDescription>Employee-only · from the opportunity queue</CardDescription></CardHeader>
              <CardContent>
                {opp ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Expected value</dt><dd className="text-lg font-semibold tabular-nums">{usd(opp.expected_value)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Retention odds</dt><dd className="text-lg font-semibold tabular-nums">{pct(opp.retention_odds)}</dd></div>
                    <div className="col-span-2"><dt className="text-xs text-muted-foreground">Next best action</dt><dd>{label(opp.next_best_action)}</dd></div>
                  </dl>
                ) : <p className="text-sm text-muted-foreground">Not in the opportunity queue.</p>}
              </CardContent>
            </Card>
            <ReviewForm id={id} options={[r.recommended, ...r.alternatives].filter((s) => s.eligible).map((s) => ({ option: s.option, label: s.label }))} recommended={r.recommended.option} />
          </div>
        </>
      )}
    </div>
  );
}

const field = "w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";

function ReviewForm({ id, options, recommended }: { id: string; options: { option: OptionType; label: string }[]; recommended: OptionType }) {
  const [decision, setDecision] = useState<RecommendationReview["decision"]>("approve");
  const [override, setOverride] = useState<OptionType | "">(options.find((o) => o.option !== recommended)?.option ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [audit, setAudit] = useState<AuditEntry>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: RecommendationReview = { decision, reviewer: EMPLOYEE_ID, reason: reason.trim(), ...(decision === "override" && override ? { override_option: override } : {}) };
    setBusy(true);
    setError(undefined);
    try {
      setAudit(await api<AuditEntry>(`/customers/${id}/recommendation/review`, { method: "POST", body: JSON.stringify(body) }));
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader><CardTitle>Decision</CardTitle><CardDescription>L3: your approval releases this to the customer</CardDescription></CardHeader>
      <CardContent>
        {audit ? (
          <div role="status" className="space-y-1 text-sm">
            <p className="font-medium">{label(audit.action)} by {audit.actor}</p>
            <p className="text-muted-foreground">Logged {asOf(audit.at)} · audit <span className="font-mono">{audit.id}</span></p>
            <Button variant="outline" size="sm" onClick={() => setAudit(undefined)}>Review again</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 text-sm">
            <fieldset className="flex gap-4">
              <legend className="sr-only">Decision</legend>
              {(["approve", "override"] as const).map((d) => (
                <label key={d} className="flex items-center gap-1.5">
                  <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} />
                  {label(d)}
                </label>
              ))}
            </fieldset>
            {decision === "override" && (
              <label className="block space-y-1">
                <span className="text-muted-foreground">Recommend instead</span>
                <select required value={override} onChange={(e) => setOverride(e.target.value as OptionType)} className={field}>
                  {options.filter((o) => o.option !== recommended).map((o) => <option key={o.option} value={o.option}>{o.label}</option>)}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-muted-foreground">Reason (required)</span>
              <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={field} placeholder="Why you approve or override" />
            </label>
            {error && <p role="alert" className="text-destructive">{error.message}</p>}
            <Button type="submit" disabled={busy || !reason.trim()}>{decision === "approve" ? "Approve" : "Override"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
