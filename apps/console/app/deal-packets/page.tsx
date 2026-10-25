"use client";
import Link from "next/link";
import type { DealPacket, Vehicle } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asOf, label, usd } from "@/lib/format";

const car = (v: Vehicle) => `${v.year} ${v.model} ${v.trim}`;

export default function DealPackets() {
  const { data, error, loading } = useApi<DealPacket[]>("/deal-packets");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Deal Packets</h1>
      <ApiState loading={loading} error={error} />
      <Card size="sm">
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Packet</TableHead><TableHead>Customer</TableHead><TableHead>Dealer</TableHead><TableHead>Vehicle</TableHead>
                <TableHead>Option</TableHead><TableHead className="text-right">Monthly</TableHead><TableHead>Eligibility</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id}</TableCell>
                  <TableCell><Link href={`/customers/${p.customer_id}`} className="font-mono text-xs hover:underline">{p.customer_id}</Link></TableCell>
                  <TableCell>{p.dealer.name}<span className="block text-xs text-muted-foreground">{p.dealer.address}</span></TableCell>
                  <TableCell>{car(p.vehicle)}{p.target_vehicle && <span className="block text-xs text-muted-foreground">→ {car(p.target_vehicle)}</span>}</TableCell>
                  <TableCell>{p.scenario.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{usd(p.scenario.monthly_payment)}</TableCell>
                  <TableCell><span className="block max-w-56 whitespace-normal text-xs">{p.eligibility.join(" · ") || "—"}</span></TableCell>
                  <TableCell><Badge variant={p.status === "received" ? "secondary" : "outline"}>{label(p.status)}</Badge></TableCell>
                  <TableCell>{asOf(p.created_at)}</TableCell>
                </TableRow>
              ))}
              {data && !data.length && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No deal packets yet. They appear when a customer sends one from the app.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
