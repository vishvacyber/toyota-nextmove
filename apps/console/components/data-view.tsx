"use client";
import { useApi } from "@nextmove/contracts/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = Record<string, unknown>;
const scalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);
// Years print as-is ("2024", not "2,024").
const show = (v: unknown, key = "") =>
  typeof v === "number" && key !== "year" ? v.toLocaleString("en-US", { maximumFractionDigits: 3 }) : String(v);

/** Generic Stage 0 view: proves a page loads its endpoint's mock data. */
export function DataView({ endpoint }: { endpoint: string }) {
  const { data, error, loading } = useApi<Row | Row[]>(endpoint);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-mono text-sm">GET {endpoint}</CardTitle>
        {Array.isArray(data) && <Badge variant="secondary">{data.length} rows</Badge>}
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        {Array.isArray(data) ? <RowsTable rows={data} /> : data && <Fields row={data} />}
      </CardContent>
    </Card>
  );
}

function RowsTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No rows.</p>;
  const cols = Object.keys(rows[0]).filter((k) => scalar(rows[0][k])).slice(0, 7);
  return (
    <Table>
      <TableHeader>
        <TableRow>{cols.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 25).map((r, i) => (
          <TableRow key={i}>{cols.map((c) => <TableCell key={c}>{scalar(r[c]) ? show(r[c], c) : "…"}</TableCell>)}</TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Fields({ row }: { row: Row }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
      {Object.entries(row).filter(([, v]) => scalar(v)).map(([k, v]) => (
        <div key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{show(v, k)}</dd>
        </div>
      ))}
    </dl>
  );
}
