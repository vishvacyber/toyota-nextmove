"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Call } from "@nextmove/contracts";
import { api } from "@nextmove/contracts/client";
import { MockBadge } from "@/components/mock-provider";
import { RealtimeBadge } from "@/components/realtime-badge";
import { ApiState, Empty } from "@/components/state";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EMPLOYEE_NAME } from "@/lib/employee";
import { asOf, label } from "@/lib/format";
import { useRealtimeList } from "@/lib/realtime";

const EVENTS = ["updated"] as const;
const WHO = { customer: "Customer", agent: "AI agent", employee: "TFS", system: "" } as const;

/** Voice calls from the kiosk and app, live: transcript, Guardian flags per agent turn, and Take over. */
export function LiveCalls() {
  const { items, error, loading, realtime, broadcast } = useRealtimeList<Call>("/calls", "calls", EVENTS);
  const calls = [...items].sort((a, b) => Number(a.status === "ended") - Number(b.status === "ended") || b.started_at.localeCompare(a.started_at)).slice(0, 6);
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">Live calls <MockBadge path="/calls" /></CardTitle>
          <CardDescription>Customers talking to the voice agent now. Every agent turn is Guardian-checked; take over any time.</CardDescription>
        </div>
        <RealtimeBadge realtime={realtime} offline="refresh to update" />
      </CardHeader>
      <CardContent className="space-y-2">
        <ApiState loading={loading} error={error} />
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="Calls">
          {calls.map((c) => <CallCard key={c.id} c={c} onChange={(x) => broadcast("updated", x)} />)}
          {!loading && !calls.length && <li><Empty>No calls yet. When a customer taps “Talk to someone”, the call shows up here live.</Empty></li>}
        </ul>
      </CardContent>
    </Card>
  );
}

function CallCard({ c, onChange }: { c: Call; onChange: (c: Call) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const flagged = c.lines.filter((l) => l.guardian && l.guardian.verdict !== "pass").length;
  const mine = c.status === "human" && c.taken_by === EMPLOYEE_NAME;

  const post = (path: string, body: object) =>
    api<Call>(`/calls/${c.id}/${path}`, { method: "POST", body: JSON.stringify(body) }).then(onChange, (e: Error) => toast(`Call update failed: ${e.message}`, true));
  const send = (e: FormEvent) => { e.preventDefault(); if (text.trim()) void post("messages", { text: text.trim() }).then(() => setText("")); };

  return (
    <li className={`flex flex-col rounded-md border p-3 text-sm ${c.status === "ai" ? "border-primary" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {c.customer_id === "GUEST" ? "Walk-in guest" : <Link href={`/customers/${c.customer_id}`} className="font-mono text-xs hover:underline">{c.customer_id}</Link>}
          <span className="text-muted-foreground"> · {label(c.surface)} · {asOf(c.started_at)}</span>
        </p>
        <div className="flex items-center gap-1">
          {flagged > 0 && <Badge variant="destructive">{flagged} flagged</Badge>}
          <Badge variant={c.status === "ended" ? "secondary" : "default"}>
            {c.status === "ai" ? "AI on call" : c.status === "human" ? `${c.taken_by} on call` : "Ended"}
          </Badge>
        </div>
      </div>
      <ol className="mt-2 max-h-56 space-y-1.5 overflow-y-auto" aria-live="polite">
        {c.lines.slice(-12).map((l, i) => (
          <li key={i} className={l.role === "system" ? "text-xs text-muted-foreground" : ""}>
            {WHO[l.role] && <span className="font-medium">{WHO[l.role]}: </span>}
            {l.text}
            {l.guardian && l.guardian.verdict !== "pass" && (
              <span className="block text-xs text-destructive">
                ⚠ Guardian {l.guardian.verdict}: {l.guardian.checks.filter((x) => !x.passed).map((x) => x.detail ?? x.name).join("; ")}
              </span>
            )}
          </li>
        ))}
      </ol>
      {c.status === "ai" && (
        <Button size="sm" className="mt-2 self-start" onClick={() => void post("takeover", { employee: EMPLOYEE_NAME }).then(() => toast(`You joined the call with ${c.customer_id}`))}>
          Take over
        </Button>
      )}
      {mine && (
        <form onSubmit={send} className="mt-2 flex gap-2">
          <label htmlFor={`say-${c.id}`} className="sr-only">Message to the customer (read aloud on their screen)</label>
          <Input id={`say-${c.id}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type; it's read aloud to the customer" maxLength={500} />
          <Button type="submit" size="sm" disabled={!text.trim()}>Send</Button>
        </form>
      )}
      {c.trace_id && <Link href="/traces" className="mt-2 text-xs text-muted-foreground hover:underline">Trace {c.trace_id} (voice agent)</Link>}
    </li>
  );
}
