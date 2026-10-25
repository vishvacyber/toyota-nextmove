"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Handoff } from "@nextmove/contracts";
import { api } from "@nextmove/contracts/client";
import { supabase } from "./supabase";
import { upsertHandoff } from "./upsert";

export type Realtime = "connecting" | "live" | "offline";

/**
 * Handoff inbox shared with the customer app (K2) over Supabase Realtime Broadcast:
 * channel `handoffs`, event `created` / `updated`, payload = full contract Handoff.
 */
export function useHandoffs() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [error, setError] = useState<Error>();
  const [realtime, setRealtime] = useState<Realtime>(supabase ? "connecting" : "offline");
  const channel = useRef<RealtimeChannel | null>(null);
  const upsert = useCallback((h: Handoff) => setHandoffs((list) => upsertHandoff(list, h)), []);

  useEffect(() => {
    api<Handoff[]>("/handoffs").then((seed) => setHandoffs((list) => seed.reduce(upsertHandoff, list)), setError);
    if (!supabase) return;
    let active = true; // dev mode mounts twice; the first channel's late CLOSED must not mark us offline
    // self: true so the tab that broadcasts sees its own event, same as every other tab.
    const ch = supabase
      .channel("handoffs", { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "created" }, ({ payload }) => upsert(payload as Handoff))
      .on("broadcast", { event: "updated" }, ({ payload }) => upsert(payload as Handoff))
      .subscribe((status) => active && setRealtime(status === "SUBSCRIBED" ? "live" : "offline"));
    channel.current = ch;
    return () => {
      active = false;
      channel.current = null;
      void supabase?.removeChannel(ch);
    };
  }, [upsert]);

  const broadcast = useCallback((event: "created" | "updated", h: Handoff) => {
    upsert(h);
    void channel.current?.send({ type: "broadcast", event, payload: h });
  }, [upsert]);

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

  return { handoffs, error, realtime, claim, broadcast };
}
