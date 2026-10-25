import { Badge } from "@/components/ui/badge";
import type { Realtime } from "@/lib/realtime";

/** Realtime status for a seeded + live list (C2 inbox, C4 traces). */
export function RealtimeBadge({ realtime, offline }: { realtime: Realtime; offline: string }) {
  return (
    <Badge variant={realtime === "live" ? "secondary" : "outline"} aria-live="polite">
      <span className={`size-2 rounded-full ${realtime === "live" ? "bg-green-500" : "bg-muted-foreground"}`} aria-hidden />
      {realtime === "live" ? "Realtime live" : realtime === "connecting" ? "Connecting…" : `Realtime offline · ${offline}`}
    </Badge>
  );
}
