"use client";
import Link from "next/link";
import { useState } from "react";
import type { Alert } from "@nextmove/contracts";
import { api, useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EMPLOYEE_ID } from "@/lib/employee";
import { asOf, label } from "@/lib/format";

export default function Approvals() {
  const { data, error, loading } = useApi<Alert[]>("/alerts?status=pending_approval");
  // Decided alerts stay on screen with their new status until reload.
  const [decided, setDecided] = useState<Record<string, Alert>>({});
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<Error>();

  async function decide(a: Alert, status: "approved" | "dismissed") {
    setBusy(a.id);
    setActionError(undefined);
    try {
      const updated = await api<Alert>(`/alerts/${a.id}`, { method: "PATCH", body: JSON.stringify({ status, actor: EMPLOYEE_ID }) });
      setDecided((d) => ({ ...d, [a.id]: updated }));
    } catch (e) {
      setActionError(e as Error);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Alert Approvals</h1>
        <p className="text-sm text-muted-foreground">L3 customer-facing alerts drafted by agents. Nothing reaches a customer until you approve it.</p>
      </div>
      <ApiState loading={loading} error={error ?? actionError} />
      <div className="grid gap-3 lg:grid-cols-2">
        {data?.map((orig) => {
          const a = decided[orig.id] ?? orig;
          return (
            <Card key={a.id} size="sm">
              <CardHeader>
                <CardTitle>{a.title}</CardTitle>
                <CardDescription>
                  <Link href={`/customers/${a.customer_id}`} className="font-mono hover:underline">{a.customer_id}</Link> · {label(a.type)} · {asOf(a.created_at)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{a.body}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{a.autonomy_level}</Badge>
                  <Badge variant={a.consent ? "secondary" : "destructive"}>{a.consent ? "Customer consented" : "No consent on file"}</Badge>
                  {a.drafted_by && <Badge variant="outline">Drafted by {a.drafted_by}</Badge>}
                  {a.trace_id && <Badge variant="outline" className="font-mono">{a.trace_id}</Badge>}
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                {a.status === "pending_approval" ? (
                  <>
                    <Button size="sm" disabled={busy === a.id} onClick={() => decide(a, "approved")}>Approve</Button>
                    <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => decide(a, "dismissed")}>Dismiss</Button>
                  </>
                ) : (
                  <Badge role="status" variant={a.status === "dismissed" ? "outline" : "secondary"}>{label(a.status)} by {EMPLOYEE_ID}</Badge>
                )}
              </CardFooter>
            </Card>
          );
        })}
        {data && !data.length && <p className="text-sm text-muted-foreground">No alerts waiting for approval.</p>}
      </div>
    </div>
  );
}
