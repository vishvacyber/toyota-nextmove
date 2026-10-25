"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Handoff } from "@nextmove/contracts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = URL && KEY ? createClient(URL, KEY) : null;

/**
 * Broadcast on channel `handoffs` (shared with the C2 console): we send `created` with the full Handoff,
 * the console sends `updated`. MSW mocks live per browser, so this is what carries the handoff across.
 * Unmounting (sign-out, kiosk idle reset) removes the channel.
 */
export function useHandoffChannel() {
  const channel = useRef<RealtimeChannel | null>(null);
  const [live, setLive] = useState<boolean | null>(supabase ? null : false);
  const [handoffs, setHandoffs] = useState<Record<string, Handoff>>({});
  const mine = useRef(new Set<string>());

  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel("handoffs")
      .on("broadcast", { event: "updated" }, ({ payload }) => {
        const h = payload as Handoff;
        if (mine.current.has(h.id)) setHandoffs((all) => ({ ...all, [h.id]: { ...all[h.id], ...h } }));
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    channel.current = ch;
    return () => {
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, []);

  /** Track a handoff the API just created and announce it to the console. */
  const announce = useCallback((h: Handoff) => {
    mine.current.add(h.id);
    setHandoffs((all) => ({ ...all, [h.id]: h }));
    void channel.current?.send({ type: "broadcast", event: "created", payload: h });
  }, []);

  return { live, handoffs, announce };
}
export type HandoffChannel = ReturnType<typeof useHandoffChannel>;
