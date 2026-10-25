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
  const { items: handoffs, error, loading, realtime, broadcast } = useRealtimeList<Handoff>("/handoffs", "handoffs", EVENTS);

  // The real API broadcasts too; the console's own broadcast keeps offline mock mode live. Upsert by id makes the duplicate harmless.
  const claim = useCallback(async (h: Handoff, by: string) => {
    broadcast("updated", await api<Handoff>(`/handoffs/${h.id}`, { method: "PATCH", body: JSON.stringify({ status: "claimed", claimed_by: by }) }));
  }, [broadcast]);

  return { handoffs, error, loading, realtime, claim, broadcast: broadcast as (event: (typeof EVENTS)[number], h: Handoff) => void };
}
