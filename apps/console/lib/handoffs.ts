"use client";
import { useCallback } from "react";
import type { Handoff } from "@nextmove/contracts";
import { api } from "@nextmove/contracts/client";
import { useRealtimeList } from "./realtime";

export type { Realtime } from "./realtime";

const EVENTS = ["created", "updated"] as const;

/**
 * Handoff inbox shared with the customer app (K2) over Supabase Realtime Broadcast:
 * channel `handoffs`, event `created` / `updated`, payload = full contract Handoff.
 */
export function useHandoffs() {
  const { items: handoffs, error, realtime, broadcast } = useRealtimeList<Handoff>("/handoffs", "handoffs", EVENTS);

  const claim = useCallback(async (h: Handoff, by: string) => {
    let claimed: Handoff;
    try {
      claimed = await api<Handoff>(`/handoffs/${h.id}`, { method: "PATCH", body: JSON.stringify({ status: "claimed", claimed_by: by }) });
    } catch (e) {
      // shortcut: a handoff broadcast from another browser isn't in this browser's MSW store, so 404 → claim locally; drop once the real API holds handoffs.
      if (!(e instanceof Error && e.message.endsWith("404"))) throw e;
      claimed = { ...h, status: "claimed", claimed_by: by };
    }
    broadcast("updated", claimed);
  }, [broadcast]);

  return { handoffs, error, realtime, claim, broadcast: broadcast as (event: (typeof EVENTS)[number], h: Handoff) => void };
}
