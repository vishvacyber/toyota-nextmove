import type { Scenario } from "@nextmove/contracts";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usd } from "@/lib/format";

export function ScenarioTable({ recommended, others }: { recommended: Scenario; others: Scenario[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Option</TableHead>
          <TableHead className="text-right">Monthly</TableHead>
          <TableHead className="text-right">Total cost</TableHead>
          <TableHead className="text-right">Equity</TableHead>
          <TableHead className="text-right">Fees</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[recommended, ...others].map((s) => (
          <TableRow key={s.option} className={s === recommended ? "bg-primary/10" : undefined}>
            <TableCell>
              {s.label} {s === recommended && <Badge className="ml-1">Recommended</Badge>}
              {!s.eligible && <span className="block text-xs text-muted-foreground">{s.ineligible_reason}</span>}
            </TableCell>
            <TableCell className="text-right tabular-nums">{usd(s.monthly_payment)}</TableCell>
            <TableCell className="text-right tabular-nums">{usd(s.total_cost)}</TableCell>
            <TableCell className="text-right tabular-nums">{usd(s.equity)}</TableCell>
            <TableCell className="text-right tabular-nums">{usd(s.fees)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
