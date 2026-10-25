"use client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading skeleton / error card with retry, shared by every page. */
export function ApiState({ loading, error, rows = 3 }: { loading: boolean; error?: Error; rows?: number }) {
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <span><span className="font-medium text-destructive">Couldn&apos;t load data.</span> <span className="text-muted-foreground">{error.message}</span></span>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }
  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading" className="space-y-2">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }
  return null;
}

/** Empty-state line for lists and tables. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{children}</p>;
}
