"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type ColumnDef, type ColumnFiltersState, type SortingState,
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Opportunity } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { label, pct, usd } from "@/lib/format";

const columns: ColumnDef<Opportunity>[] = [
  { accessorKey: "priority", header: "Priority", filterFn: "equalsString", cell: ({ getValue }) => <Badge variant={getValue() === 1 ? "default" : "secondary"}>P{String(getValue())}</Badge> },
  {
    accessorKey: "customer_name", header: "Customer",
    cell: ({ row }) => (
      <Link href={`/customers/${row.original.customer_id}`} className="font-medium hover:underline">
        {row.original.customer_name}
        <span className="block font-mono text-xs text-muted-foreground">{row.original.customer_id}</span>
      </Link>
    ),
  },
  { accessorKey: "model", header: "Model" },
  { accessorKey: "situation", header: "Situation", filterFn: "equalsString", cell: ({ getValue }) => label(String(getValue())) },
  { accessorKey: "next_best_action", header: "Next best action", cell: ({ getValue }) => <Badge variant="outline">{label(String(getValue()))}</Badge> },
  { accessorKey: "expected_value", header: "$ value", meta: { num: true }, cell: ({ getValue }) => usd(getValue() as number) },
  { accessorKey: "retention_odds", header: "Retention odds", meta: { num: true }, cell: ({ getValue }) => pct(getValue() as number) },
  { accessorKey: "days_to_maturity", header: "Days to maturity", meta: { num: true }, sortUndefined: "last", cell: ({ getValue }) => (getValue() as number | undefined) ?? "—" },
  { accessorKey: "reason", header: "Why queued", enableSorting: false, cell: ({ getValue }) => <span className="block max-w-56 whitespace-normal">{String(getValue())}</span> },
  { accessorKey: "script", header: "Script", enableSorting: false, cell: ({ getValue }) => <span className="block max-w-72 whitespace-normal text-muted-foreground italic">“{String(getValue())}”</span> },
];

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export default function Queue() {
  const { data, error, loading } = useApi<Opportunity[]>("/opportunities");
  const [sorting, setSorting] = useState<SortingState>([{ id: "priority", desc: false }, { id: "expected_value", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const rows = useMemo(() => data ?? [], [data]);
  const situations = useMemo(() => [...new Set(rows.map((o) => o.situation))].sort(), [rows]);
  const priorities = useMemo(() => [...new Set(rows.map((o) => o.priority))].sort(), [rows]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table v8 is the documented shadcn data-table pattern
  const table = useReactTable({
    data: rows, columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting, onColumnFiltersChange: setColumnFilters, onGlobalFilterChange: setGlobalFilter,
    // Search covers name, id, model and reason.
    globalFilterFn: (row, _, q: string) =>
      `${row.original.customer_name} ${row.original.customer_id} ${row.original.model ?? ""} ${row.original.reason}`.toLowerCase().includes(q.toLowerCase()),
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(),
  });
  const filter = (id: string) => (table.getColumn(id)?.getFilterValue() as string) ?? "";
  const setFilter = (id: string, v: string) => table.getColumn(id)?.setFilterValue(v || undefined);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Opportunity Queue</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search" placeholder="Search name, ID, model, reason…" aria-label="Search opportunities"
          value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-8 w-72"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Situation</span>
          <select value={filter("situation")} onChange={(e) => setFilter("situation", e.target.value)} className={selectClass}>
            <option value="">All</option>
            {situations.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Priority</span>
          <select value={filter("priority")} onChange={(e) => setFilter("priority", e.target.value)} className={selectClass}>
            <option value="">All</option>
            {priorities.map((p) => <option key={p} value={p}>P{p}</option>)}
          </select>
        </label>
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {table.getRowModel().rows.length} of {rows.length} opportunities
        </span>
      </div>
      <ApiState loading={loading} error={error} />
      <Card size="sm">
        <CardContent>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => {
                    const sorted = h.column.getIsSorted();
                    const num = (h.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                    return (
                      <TableHead key={h.id} aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined} className={num ? "text-right" : undefined}>
                        {h.column.getCanSort() ? (
                          <Button variant="ghost" size="sm" className="-mx-2" onClick={h.column.getToggleSortingHandler()}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {sorted === "asc" ? <ArrowUp /> : sorted === "desc" ? <ArrowDown /> : <ArrowUpDown className="opacity-40" />}
                          </Button>
                        ) : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((r) => (
                <TableRow key={r.id}>
                  {r.getVisibleCells().map((c) => (
                    <TableCell key={c.id} className={(c.column.columnDef.meta as { num?: boolean } | undefined)?.num ? "text-right tabular-nums" : undefined}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!loading && !error && !table.getRowModel().rows.length && (
                <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground">No matching opportunities.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
