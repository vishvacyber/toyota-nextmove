"use client";
import Link from "next/link";
import type { AgentTrace, AuditEntry, FairnessReport, StudioAgent } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asOf, label, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

type Group = FairnessReport["groups"][number];
const DIMENSIONS: { key: Group["dimension"]; title: string }[] = [{ key: "region", title: "By region" }, { key: "credit_tier", title: "By credit tier" }];

const customer = (id?: string) => (id ? <Link href={`/customers/${id}`} className="font-mono text-xs hover:underline">{id}</Link> : "—");
const trace = (id?: string) => (id ? <Link href="/traces" className="font-mono text-xs hover:underline">{id}</Link> : "—");

function AuditTable({ rows, override }: { rows: AuditEntry[]; override?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead><TableHead>Actor</TableHead><TableHead>Action</TableHead><TableHead>Customer</TableHead>
          <TableHead>Level</TableHead><TableHead>{override ? "Override reason" : "Detail"}</TableHead><TableHead>Trace</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => (
          <TableRow key={a.id}>
            <TableCell>{asOf(a.at)}</TableCell>
            <TableCell className="font-mono text-xs">{a.actor}</TableCell>
            <TableCell>{label(a.action)}</TableCell>
            <TableCell>{customer(a.customer_id)}</TableCell>
            <TableCell><Badge variant="outline">{a.autonomy_level}</Badge></TableCell>
            <TableCell className="whitespace-normal">{(override ? a.override_reason : a.detail) ?? "—"}</TableCell>
            <TableCell>{trace(a.trace_id)}</TableCell>
          </TableRow>
        ))}
        {!rows.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{override ? "No overrides." : "No audit entries."}</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

export default function ResponsibleAI() {
  const fairness = useApi<FairnessReport>("/fairness");
  const audit = useApi<AuditEntry[]>("/audit");
  const traces = useApi<AgentTrace[]>("/traces");
  const agents = useApi<StudioAgent[]>("/studio/agents");
  const f = fairness.data;
  const overrides = audit.data?.filter((a) => a.override_reason) ?? [];
  const versions = [
    ...new Map((traces.data ?? []).map((t) => [`${t.agent}|${t.model}|${t.prompt_version}`, { agent: t.agent, model: t.model, prompt: t.prompt_version, source: "Trace" }])).values(),
    ...(agents.data ?? []).map((a) => ({ agent: a.name, model: undefined, prompt: a.prompt_version, source: "Studio" })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Responsible AI</h1>
        <p className="text-sm text-muted-foreground">Fairness by region and credit tier only (no protected attributes are stored), every agent and human action, overrides, and the model and prompt versions in use.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fairness report</CardTitle>
          <CardDescription>
            {f ? <>Source: fairness report · as of {asOf(f.as_of)} · groups whose rate gap exceeds {pct(f.threshold)} are flagged</> : "Recommendation and offer rates per group"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <ApiState loading={fairness.loading} error={fairness.error} />
          {f && DIMENSIONS.map((d) => (
            <section key={d.key}>
              <h2 className="mb-1 font-medium">{d.title}</h2>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Group</TableHead><TableHead className="text-right">Customers</TableHead><TableHead className="text-right">Recommendation rate</TableHead><TableHead className="text-right">Offer rate</TableHead><TableHead /></TableRow>
                </TableHeader>
                <TableBody>
                  {f.groups.filter((g) => g.dimension === d.key).map((g) => (
                    <TableRow key={g.group} className={cn(g.flagged && "bg-destructive/10 hover:bg-destructive/15")}>
                      <TableCell className="font-medium">{d.key === "credit_tier" ? `Tier ${g.group}` : g.group}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.customers.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(g.recommendation_rate, 1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(g.offer_rate, 1)}</TableCell>
                      <TableCell className="text-right">{g.flagged && <Badge variant="destructive">Gap over threshold</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Overrides</CardTitle><CardDescription>Audit entries where a person overrode a recommendation, with their reason</CardDescription></CardHeader>
        <CardContent><ApiState loading={audit.loading} error={audit.error} /><AuditTable rows={overrides} override /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Audit log</CardTitle><CardDescription>{audit.data?.length ?? 0} entries · agents and employees</CardDescription></CardHeader>
        <CardContent><AuditTable rows={audit.data ?? []} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Model and prompt versions</CardTitle><CardDescription>From agent traces and Agent Studio</CardDescription></CardHeader>
        <CardContent>
          <ApiState loading={traces.loading || agents.loading} error={traces.error ?? agents.error} />
          <Table>
            <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Model</TableHead><TableHead>Prompt version</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
            <TableBody>
              {versions.map((v, i) => (
                <TableRow key={i}>
                  <TableCell>{label(v.agent)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {v.model ?? "—"} {v.model?.startsWith("fallback:") && <Badge variant="outline">Fallback</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{v.prompt}</TableCell>
                  <TableCell><Badge variant="secondary">{v.source}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
