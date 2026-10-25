"use client";
import Link from "next/link";
import type { Handoff, Session } from "@nextmove/contracts";
import { api, useApi } from "@nextmove/contracts/client";
import { RealtimeBadge } from "@/components/realtime-badge";
import { ApiState, Empty } from "@/components/state";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPLOYEE_ID } from "@/lib/employee";
import { asOf, label } from "@/lib/format";
import { useHandoffs } from "@/lib/handoffs";
import { LiveCalls } from "@/components/live-calls";
import { MockBadge } from "@/components/mock-provider";

const ORDER: Record<Handoff["status"], number> = { waiting: 0, claimed: 1, resolved: 2 };
const DEV = process.env.NODE_ENV !== "production";

const customer = (id: string) => <Link href={`/customers/${id}`} className="font-mono text-xs hover:underline">{id}</Link>;

export default function LiveActivity() {
  const sessions = useApi<Session[]>("/sessions");
  const { handoffs, error, loading, realtime, claim, broadcast } = useHandoffs();
  const toast = useToast();
  const inbox = [...handoffs].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.created_at.localeCompare(a.created_at));

  // Dev only: creates a real handoff, the same call the kiosk makes.
  function simulate() {
    api<Handoff>("/handoffs", { method: "POST", body: JSON.stringify({ customer_id: "CUST-MARIA", reason: "Talk to a person about lease buyout", surface: "kiosk" }) })
      .then((h) => broadcast("created", h), (e: Error) => toast(`Couldn't create handoff: ${e.message}`, true));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Live Activity</h1>
      <LiveCalls />
      <div className="grid gap-3 xl:grid-cols-2">
        <Card size="sm">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">Handoff inbox <MockBadge path="/handoffs" /></CardTitle>
              <CardDescription>Customers who asked for a person</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <RealtimeBadge realtime={realtime} offline="mock list only" />
              {DEV && <Button variant="outline" size="sm" onClick={simulate}>Simulate customer handoff</Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <ApiState loading={loading} error={error} />
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
                      <Button size="sm" onClick={() => claim(h, EMPLOYEE_ID).then(() => toast(`Claimed handoff from ${h.customer_id}`), (e: Error) => toast(`Claim failed: ${e.message}`, true))}>Claim</Button>
                    ) : h.claimed_by && <span className="text-xs text-muted-foreground">by {h.claimed_by}</span>}
                  </div>
                </li>
              ))}
              {!loading && !inbox.length && <li><Empty>No handoffs. New requests from the app or kiosk appear here live.</Empty></li>}
            </ul>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader><CardTitle className="flex items-center gap-2">Live sessions <MockBadge path="/sessions" /></CardTitle><CardDescription>Customers in the app or kiosk now</CardDescription></CardHeader>
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
