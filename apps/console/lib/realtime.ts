"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { api } from "@nextmove/contracts/client";
import { supabase } from "./supabase";
import { upsertById } from "./upsert";

export type Realtime = "connecting" | "live" | "offline";

/**
 * A list seeded from `path`, then kept live over Supabase Realtime Broadcast on `channel`:
 * every event in `events` carries a full contract object that is upserted by id.
 */
export function useRealtimeList<T extends { id: string }>(path: string, channel: string, events: readonly string[]) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<Error>();
  const [realtime, setRealtime] = useState<Realtime>(supabase ? "connecting" : "offline");
  const ch = useRef<RealtimeChannel | null>(null);
  const upsert = useCallback((x: T) => setItems((list) => upsertById(list, x)), []);
  const eventKey = events.join(",");

  // A new path (e.g. a filter) merges its seed into the list; callers filter what they show.
  useEffect(() => {
    let active = true;
    api<T[]>(path).then(
      (seed) => { if (active) { setError(undefined); setItems((list) => seed.reduce(upsertById, list)); } },
      (e: Error) => active && setError(e),
    );
    return () => { active = false; };
  }, [path]);

  useEffect(() => {
    if (!supabase) return;
    let active = true; // dev mode mounts twice; the first channel's late CLOSED must not mark us offline
    // self: true so the tab that broadcasts sees its own event, same as every other tab.
    let c = supabase.channel(channel, { config: { broadcast: { self: true } } });
    for (const event of eventKey.split(",")) c = c.on("broadcast", { event }, ({ payload }) => upsert(payload as T));
    c.subscribe((status) => active && setRealtime(status === "SUBSCRIBED" ? "live" : "offline"));
    ch.current = c;
    return () => {
      active = false;
      ch.current = null;
      void supabase?.removeChannel(c);
    };
  }, [channel, eventKey, upsert]);

  const broadcast = useCallback((event: string, x: T) => {
    upsert(x);
    void ch.current?.send({ type: "broadcast", event, payload: x });
  }, [upsert]);

  return { items, error, realtime, broadcast };
}
