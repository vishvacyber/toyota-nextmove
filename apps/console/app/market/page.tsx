"use client";
import type { MarketQuote, Model } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { ApiState } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { asOf, usd } from "@/lib/format";

const MODELS: Model[] = ["RAV4", "Camry", "Tacoma", "Highlander", "Prius", "bZ"];
const TREND = { up: "▲ Rising", flat: "■ Flat", down: "▼ Falling" } as const;
const link = "underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring";

function MarketCard({ model }: { model: Model }) {
  const { data: q, error, loading } = useApi<MarketQuote>(`/market/${model}`);
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{q?.year} {model}</CardDescription>
        <CardTitle className="text-2xl tabular-nums group-data-[size=sm]/card:text-2xl">{q ? usd(q.estimated_value) : model}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ApiState loading={loading} error={error} />
        {q && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Range <span className="tabular-nums text-foreground">{usd(q.low)} – {usd(q.high)}</span></span>
              {q.trend?.direction && <Badge variant="outline">{TREND[q.trend.direction]}</Badge>}
              {q.trend?.demand_index != null && <span>Demand index <span className="tabular-nums text-foreground">{q.trend.demand_index}</span></span>}
            </div>
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comps</h3>
              <ul className="divide-y">
                {q.comps.slice(0, 3).map((c) => (
                  <li key={c.source_url} className="flex justify-between gap-2 py-1">
                    <a href={c.source_url} target="_blank" rel="noreferrer" className={`truncate ${link}`}>{c.title}</a>
                    <span className="shrink-0 tabular-nums">{usd(c.price)}{c.miles != null && <span className="text-muted-foreground"> · {c.miles.toLocaleString()} mi</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recalls</h3>
              {q.recalls.length ? (
                <ul>
                  {q.recalls.map((r) => (
                    <li key={r.source_url} className="flex justify-between gap-2 py-1">
                      <a href={r.source_url} target="_blank" rel="noreferrer" className={`text-destructive ${link}`}>{r.title}</a>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.date}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="py-1 text-muted-foreground">No open recalls</p>}
            </div>
            {q.reviews_summary && <p className="text-xs text-muted-foreground">{q.reviews_summary}</p>}
          </>
        )}
      </CardContent>
      {q && (
        <CardFooter className="text-xs text-muted-foreground">
          Source: {q.source} · as of {asOf(q.as_of)}{q.cached && " · cached"}
        </CardFooter>
      )}
    </Card>
  );
}

export default function MarketIntel() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Market Intel</h1>
        <p className="text-sm text-muted-foreground">Used-market values, demand trend and recalls per model. Every number carries its source and as-of time.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MODELS.map((m) => <MarketCard key={m} model={m} />)}
      </div>
    </div>
  );
}
