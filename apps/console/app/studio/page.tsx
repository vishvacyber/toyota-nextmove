"use client";
import { useState } from "react";
import type { components, DeployResult, StudioAgent } from "@nextmove/contracts";
import { api, useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asOf, label, pct } from "@/lib/format";
import { TEMPLATES, TOOLS, type Template } from "@/lib/trust";
import { cn } from "@/lib/utils";

type StudioAgentCreate = components["schemas"]["StudioAgentCreate"];
const STATUS: Record<StudioAgent["status"], "secondary" | "outline" | "destructive"> = { deployed: "secondary", draft: "outline", failed: "destructive" };

function Gate({ title, rows }: { title: string; rows: DeployResult["eval_results"] }) {
  return (
    <section>
      <h3 className="mb-1 font-medium">{title} · {rows.filter((r) => r.passed).length}/{rows.length} passed</h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.case} className={cn("flex gap-2", !r.passed && "text-destructive")}>
            <span aria-hidden>{r.passed ? "✓" : "✕"}</span>
            <span><span className="sr-only">{r.passed ? "Passed: " : "Failed: "}</span>{r.case}{r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AgentStudio() {
  const { data, error, loading } = useApi<StudioAgent[]>("/studio/agents");
  const [local, setLocal] = useState<StudioAgent[]>([]);
  const [template, setTemplate] = useState<Template>();
  const [name, setName] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<number>();
  // Display-only stopwatch for the "template → deployed" check, measured from the template click (event timeStamp and performance.now share a clock).
  const [timed, setTimed] = useState<{ id: string; start: number }>();
  const [gate, setGate] = useState<{ agent: StudioAgent; result?: DeployResult; seconds?: number }>();
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<Error>();
  // Agents created or deployed here override the fetched snapshot (the MSW store is per browser; see DECISIONS C4).
  const agents = [...local.filter((a) => !data?.some((d) => d.id === a.id)), ...(data ?? []).map((d) => local.find((a) => a.id === d.id) ?? d)];
  const keep = (a: StudioAgent) => setLocal((l) => [a, ...l.filter((x) => x.id !== a.id)]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setActionError(undefined);
    try { await fn(); } catch (e) { setActionError(e as Error); } finally { setBusy(undefined); }
  }

  function pick(t: Template, at: number) {
    setTemplate(t);
    setName(TEMPLATES[t].name);
    setTools(TEMPLATES[t].tools);
    setStartedAt(at);
  }

  const toggle = (tool: string) => setTools((ts) => (ts.includes(tool) ? ts.filter((x) => x !== tool) : [...ts, tool]));

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!template) return;
    const body: StudioAgentCreate = { name, template, tools };
    run("create", async () => {
      const a = await api<StudioAgent>("/studio/agents", { method: "POST", body: JSON.stringify(body) });
      keep(a);
      setGate({ agent: a });
      if (startedAt) setTimed({ id: a.id, start: startedAt });
    });
  }

  const deploy = (a: StudioAgent) => run(a.id, async () => {
    setGate({ agent: a });
    const result = await api<DeployResult>(`/studio/agents/${a.id}/deploy`, { method: "POST" });
    const deployed: StudioAgent = { ...a, status: result.passed ? "deployed" : "failed", deployed_at: result.deployed_at ?? a.deployed_at };
    keep(deployed);
    setGate({ agent: deployed, result, seconds: timed?.id === a.id ? (performance.now() - timed.start) / 1000 : undefined });
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agent Studio</h1>
        <p className="text-sm text-muted-foreground">Start from a template, attach registry tools, then deploy. Every deploy runs the persona evals and prompt-injection tests first.</p>
      </div>
      <ApiState loading={loading} error={error ?? actionError} />

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>New agent</CardTitle><CardDescription>Pick a template; its tools are attached for you</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-4">
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Template</legend>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(TEMPLATES) as Template[]).map((t) => (
                    <Button key={t} type="button" size="sm" variant={template === t ? "default" : "outline"} aria-pressed={template === t} onClick={(e) => pick(t, e.timeStamp)}>
                      {label(t)}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Name</span>
                <Input required value={name} onChange={(e) => setName(e.target.value)} disabled={!template} />
              </label>
              <fieldset disabled={!template}>
                <legend className="mb-1 text-sm font-medium">Tools · {tools.length} attached</legend>
                <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
                  {TOOLS.map((tool) => (
                    <label key={tool} className="flex items-center gap-2 font-mono text-xs">
                      <input type="checkbox" className="size-4 accent-primary" checked={tools.includes(tool)} onChange={() => toggle(tool)} />
                      {tool}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" disabled={!template || !name || busy === "create"}>{busy === "create" ? "Creating…" : "Create agent"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card aria-live="polite">
          <CardHeader>
            <CardTitle>Deploy gate</CardTitle>
            <CardDescription>{gate ? <>{gate.agent.name} <span className="font-mono text-xs">{gate.agent.id}</span></> : "Create or pick a draft agent to deploy"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {gate && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS[gate.agent.status]}>{label(gate.agent.status)}</Badge>
                {gate.agent.status !== "deployed" && (
                  <Button size="sm" disabled={busy === gate.agent.id} onClick={() => deploy(gate.agent)}>
                    {busy === gate.agent.id ? "Running deploy gate…" : "Deploy"}
                  </Button>
                )}
                {gate.seconds != null && <span className="text-sm text-muted-foreground">Template to deployed in {gate.seconds.toFixed(1)} s</span>}
              </div>
            )}
            {gate?.result && (
              <>
                <p className={cn("font-medium", !gate.result.passed && "text-destructive")}>{gate.result.passed ? "Gate passed" : "Gate failed: not deployed"}</p>
                <Gate title="Evals" rows={gate.result.eval_results} />
                <Gate title="Prompt-injection tests" rows={gate.result.injection_tests} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Agents</CardTitle><CardDescription>{agents.length} agents · health over the last 24 hours</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead><TableHead>Template</TableHead><TableHead>Tools</TableHead><TableHead>Status</TableHead><TableHead>Prompt</TableHead>
                <TableHead className="text-right">Runs 24h</TableHead><TableHead className="text-right">Success</TableHead><TableHead className="text-right">Avg latency</TableHead><TableHead>Deployed</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name} <span className="font-mono text-xs text-muted-foreground">{a.id}</span></TableCell>
                  <TableCell>{label(a.template)}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal font-mono text-xs">{a.tools.join(", ") || "—"}</TableCell>
                  <TableCell><Badge variant={STATUS[a.status]}>{label(a.status)}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{a.prompt_version}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.health?.runs_24h?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.health?.success_rate != null ? pct(a.health.success_rate, 1) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.health?.avg_latency_ms != null ? `${a.health.avg_latency_ms.toLocaleString()} ms` : "—"}</TableCell>
                  <TableCell>{a.deployed_at ? asOf(a.deployed_at) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {a.status !== "deployed" && <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => deploy(a)} aria-label={`Deploy ${a.name}`}>Deploy</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
