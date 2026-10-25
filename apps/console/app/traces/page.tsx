"use client";
import Link from "next/link";
import { useState } from "react";
import type { AgentTrace } from "@nextmove/contracts";
import { RealtimeBadge } from "@/components/realtime-badge";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { asOf, label } from "@/lib/format";
import { useRealtimeList } from "@/lib/realtime";
import { actionStatus } from "@/lib/trust";
import { cn } from "@/lib/utils";

const DEV = process.env.NODE_ENV !== "production";
const EVENTS = ["created"] as const;

// Dev-only stand-in for a backend trace, until the console uses the real API (C5).
function simulated(blocked: boolean): AgentTrace {
  return {
    id: `TR-SIM-${Date.now()}`, agent: "recall_notifier", customer_id: "CUST-JAMES", started_at: new Date().toISOString(), duration_ms: 1840,
    plan: ["Load customer vehicle", "Check open recalls", "Find nearest dealer", "Draft recall notice"],
    tool_calls: [
      { tool: "get_customer", input: { customer_id: "CUST-JAMES" }, output: { vin: "SIM-VIN-0001", model: "Camry" }, duration_ms: 40 },
      { tool: "get_recalls", input: { model: "Camry", year: 2022 }, output: { open_recalls: 1, source: "simulated" }, duration_ms: 210 },
      { tool: "find_dealer", input: { customer_id: "CUST-JAMES" }, output: { dealer_id: "DLR-01" }, duration_ms: 95 },
    ],
    guardian: blocked
      ? { verdict: "block", checks: [{ name: "numbers_match_tools", passed: false, detail: "Draft quotes a figure no tool returned" }, { name: "tone", passed: true }, { name: "prompt_injection", passed: true }] }
      : { verdict: "pass", checks: [{ name: "numbers_match_tools", passed: true }, { name: "tone", passed: true }, { name: "consent", passed: true }, { name: "prompt_injection", passed: true }] },
    action: blocked ? { type: "draft_alert", autonomy_level: "L3", status: "blocked" } : { type: "draft_alert", autonomy_level: "L2", status: "executed" },
    model: "simulated (dev only)", prompt_version: "recall_notifier@v1",
  };
}

const blocked = (t: AgentTrace) => t.guardian.verdict === "block";

function Guardian({ t }: { t: AgentTrace }) {
  if (blocked(t)) return <Badge variant="destructive">Blocked by Guardian</Badge>;
  return <Badge variant={t.guardian.verdict === "pass" ? "secondary" : "outline"}>Guardian {t.guardian.verdict}</Badge>;
}

function Action({ a }: { a: AgentTrace["action"] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="outline">{a.autonomy_level}</Badge>
      <span>{label(a.type)}</span>
      <Badge variant={a.autonomy_level === "L4" ? "default" : a.status === "blocked" ? "destructive" : "secondary"}>{actionStatus(a)}</Badge>
    </span>
  );
}

const json = (o: object) => <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs">{JSON.stringify(o, null, 2)}</pre>;

export default function Traces() {
  const [customer, setCustomer] = useState("");
  const path = customer ? `/traces?customer_id=${encodeURIComponent(customer)}` : "/traces";
  const { items, error, realtime, broadcast } = useRealtimeList<AgentTrace>(path, "traces", EVENTS);
  // Live events aren't filtered by the channel, so apply the customer filter here too.
  const traces = items.filter((t) => !customer || t.customer_id === customer).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const [selected, setSelected] = useState<string>();
  const t = traces.find((x) => x.id === selected) ?? traces[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agent Traces</h1>
          <p className="text-sm text-muted-foreground">Every agent run: plan, tool calls, Guardian verdict and action. New runs appear live.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RealtimeBadge realtime={realtime} offline="seeded list only" />
          <Input className="w-44" placeholder="Filter customer ID" aria-label="Filter by customer ID" value={customer} onChange={(e) => setCustomer(e.target.value.trim().toUpperCase())} />
          {DEV && <Button variant="outline" size="sm" onClick={() => broadcast("created", simulated(false))}>Simulate trace</Button>}
          {DEV && <Button variant="outline" size="sm" onClick={() => broadcast("created", simulated(true))}>Simulate blocked trace</Button>}
        </div>
      </div>
      <ApiState loading={false} error={error} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card size="sm">
          <CardHeader><CardTitle>Timeline</CardTitle><CardDescription>{traces.length} runs · newest first</CardDescription></CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Agent runs" aria-live="polite">
              {traces.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(x.id)}
                    aria-current={x.id === t?.id}
                    className={cn(
                      "w-full space-y-1 rounded-md border p-3 text-left text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
                      x.id === t?.id && "bg-muted",
                      blocked(x) && "border-destructive bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{label(x.agent)}</span>
                      <Guardian t={x} />
                    </div>
                    <p className="text-muted-foreground">
                      <span className="font-mono text-xs">{x.id}</span> · {x.customer_id ?? "portfolio"} · {asOf(x.started_at)}
                    </p>
                    <Action a={x.action} />
                  </button>
                </li>
              ))}
              {!traces.length && <li className="text-sm text-muted-foreground">No traces.</li>}
            </ul>
          </CardContent>
        </Card>

        {t && (
          <Card size="sm" className={cn(blocked(t) && "ring-2 ring-destructive")}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">{label(t.agent)} <span className="font-mono text-xs text-muted-foreground">{t.id}</span> <Guardian t={t} /></CardTitle>
              <CardDescription>
                {t.customer_id ? <Link href={`/customers/${t.customer_id}`} className="font-mono hover:underline">{t.customer_id}</Link> : "Portfolio run"}
                {" · "}{asOf(t.started_at)}{t.duration_ms != null && ` · ${t.duration_ms.toLocaleString()} ms`} · model {t.model} · prompt {t.prompt_version}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <section>
                <h2 className="mb-1 font-medium">Plan</h2>
                <ol className="list-decimal space-y-0.5 pl-5">{t.plan.map((p, i) => <li key={i}>{p}</li>)}</ol>
              </section>
              <section>
                <h2 className="mb-1 font-medium">Tool calls</h2>
                <ul className="space-y-2">
                  {t.tool_calls.map((c, i) => (
                    <li key={i} className="rounded-md border p-2">
                      <p className="mb-1"><span className="font-mono">{c.tool}</span> <span className="text-muted-foreground">· {c.duration_ms} ms</span></p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="min-w-0"><p className="text-xs text-muted-foreground">Input</p>{json(c.input)}</div>
                        <div className="min-w-0"><p className="text-xs text-muted-foreground">Output</p>{json(c.output)}</div>
                      </div>
                    </li>
                  ))}
                  {!t.tool_calls.length && <li className="text-muted-foreground">No tool calls.</li>}
                </ul>
              </section>
              <section>
                <h2 className="mb-1 font-medium">Guardian · {label(t.guardian.verdict)}</h2>
                <ul className="space-y-1">
                  {t.guardian.checks.map((c) => (
                    <li key={c.name} className={cn("flex items-start gap-2", !c.passed && "text-destructive")}>
                      <span aria-hidden>{c.passed ? "✓" : "✕"}</span>
                      <span><span className="sr-only">{c.passed ? "Passed: " : "Failed: "}</span>{label(c.name)}{c.detail && <span className="text-muted-foreground"> · {c.detail}</span>}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2 className="mb-1 font-medium">Action</h2>
                <Action a={t.action} />
                {t.action.autonomy_level === "L4" && <p className="mt-1 text-xs text-muted-foreground">L4 money or credit decisions are made by a person, never an agent.</p>}
              </section>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
