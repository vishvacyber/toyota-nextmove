"use client";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import type { Customer } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { label, pct, usd } from "@/lib/format";
import { MockBadge } from "@/components/mock-provider";

export default function Customers() {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  // GET /customers?q= searches by id or name server-side.
  const { data, error, loading } = useApi<Customer[]>(query ? `/customers?q=${encodeURIComponent(query)}` : "/customers");

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-semibold">Customers <MockBadge path="/customers" /></h1>
      <div className="flex items-center gap-3">
        <Input type="search" placeholder="Search name or ID…" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-72" />
        {data && <span className="text-sm text-muted-foreground" aria-live="polite">{data.length} customers</span>}
      </div>
      <ApiState loading={loading} error={error} />
      <Card size="sm">
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Situation</TableHead>
                <TableHead className="text-right">Payment</TableHead>
                <TableHead className="text-right">Risk</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                      {c.first_name} {c.last_name}
                      <span className="block font-mono text-xs text-muted-foreground">{c.id}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{c.vehicle.year} {c.vehicle.model} {c.vehicle.trim}</TableCell>
                  <TableCell>{label(c.contract.type)}</TableCell>
                  <TableCell>{label(c.situation)}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(c.contract.monthly_payment)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(c.risk_score)}</TableCell>
                  <TableCell><Badge variant={c.contract.status === "current" ? "secondary" : "destructive"}>{label(c.contract.status)}</Badge></TableCell>
                </TableRow>
              ))}
              {data && !data.length && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No customers match “{query}”.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
