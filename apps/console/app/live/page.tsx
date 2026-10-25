"use client";
import Link from "next/link";
import { useState } from "react";
import type { Handoff, Session } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPLOYEE_ID } from "@/lib/employee";
import { asOf, label } from "@/lib/format";
import { useHandoffs } from "@/lib/handoffs";

const ORDER: Record<Handoff["status"], number> = { waiting: 0, claimed: 1, resolved: 2 };
const DEV = process.env.NODE_ENV !== "production";

const customer = (id: string) => <Link href={`/customers/${id}`} className="font-mono text-xs hover:underline">{id}</Link>;

export default function LiveActivity() {
  const sessions = useApi<Session[]>("/sessions");
  const { handoffs, error, realtime, claim, broadcast } = useHandoffs();
  const [claimError, setClaimError] = useState<Error>();
  const inbox = [...handoffs].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.created_at.localeCompare(a.created_at));

  function simulate() {
    broadcast("created", {
      id: `HO-SIM-${Date.now()}`, customer_id: "CUST-MARIA", reason: "Talk to a person about lease buyout", surface: "kiosk",
      status: "waiting", context_summary: "Simulated from the console (dev only)", created_at: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Live Activity</h1>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card size="sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Handoff inbox</CardTitle>
              <CardDescription>Customers who asked for a person</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={realtime === "live" ? "secondary" : "outline"} aria-live="polite">
                <span className={`size-2 rounded-full ${realtime === "live" ? "bg-green-500" : "bg-muted-foreground"}`} aria-hidden />
                {realtime === "live" ? "Realtime live" : realtime === "connecting" ? "Connecting…" : "Realtime offline · mock list only"}
              </Badge>
              {DEV && <Button variant="outline" size="sm" onClick={simulate}>Simulate customer handoff</Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <ApiState loading={false} error={error ?? claimError} />
            <ul className="space-y-2" aria-label="Handoffs" aria-live="polite">
              {inbox.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">{h.reason}</p>
                    <p className="text-muted-foreground">{customer(h.customer_id)} · {label(h.surface)} · {asOf(h.created_at)}</p>
                    {h.context_summary && <p className="text-muted-foreground">{h.context_summary}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={h.status === "waiting" ? "default" : "secondary"}>{label(h.status)}</Badge>
                    {h.status === "waiting" ? (
                      <Button size="sm" onClick={() => claim(h, EMPLOYEE_ID).then(() => setClaimError(undefined), setClaimError)}>Claim</Button>
                    ) : h.claimed_by && <span className="text-xs text-muted-foreground">by {h.claimed_by}</span>}
                  </div>
                </li>
              ))}
              {!inbox.length && <li className="text-sm text-muted-foreground">No handoffs.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader><CardTitle>Live sessions</CardTitle><CardDescription>Customers in the app or kiosk now</CardDescription></CardHeader>
          <CardContent>
            <ApiState loading={sessions.loading} error={sessions.error} />
            <Table>
              <TableHeader>
                <TableRow><TableHead>Customer</TableHead><TableHead>Surface</TableHead><TableHead>Screen</TableHead><TableHead>Lang</TableHead><TableHead>Started</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {sessions.data?.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{customer(s.customer_id)}</TableCell>
                    <TableCell>{label(s.surface)}</TableCell>
                    <TableCell>{s.current_screen}</TableCell>
                    <TableCell className="uppercase">{s.language ?? "—"}</TableCell>
                    <TableCell>{asOf(s.started_at)}</TableCell>
                  </TableRow>
                ))}
                {sessions.data && !sessions.data.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No live sessions.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
