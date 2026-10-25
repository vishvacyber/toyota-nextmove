"use client";
import { useEffect, useState, type ReactNode } from "react";
import { mocked } from "@/lib/mocking";

const SETTING = process.env.NEXT_PUBLIC_API_MOCKING;
const MOCKING = SETTING !== "disabled";

// Module-level so React dev mode's double effect can't start the worker twice.
let starting: Promise<unknown> | undefined;

/**
 * The shared MockProvider, with the console's exact-path filter (lib/mocking). Paths the setting doesn't
 * list go to the real API at NEXT_PUBLIC_API_URL.
 */
export function MockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKING);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (ready) return;
    starting ??= Promise.all([import("msw/browser"), import("@nextmove/contracts/mocks/handlers")]).then(([{ setupWorker }, { handlers }]) =>
      setupWorker(...handlers.filter((h) => mocked("path" in h.info ? String(h.info.path).replace(/^\*/, "") : "", SETTING))).start({ onUnhandledRequest: "bypass", quiet: true }));
    starting.then(() => setReady(true), (e: Error) => setError(e.message));
  }, [ready]);
  if (error) return <p role="alert" style={{ padding: 24 }}>Mock API failed to start: {error}</p>;
  return ready ? children : null;
}

/** "Mock data" badge for a page section whose endpoint is still served by MSW (honest labeling while lanes merge). */
export function MockBadge({ path }: { path: string }) {
  if (!MOCKING || !mocked(path, SETTING)) return null;
  return <span title={`${path} is served by mocks (NEXT_PUBLIC_API_MOCKING)`} className="rounded-md border border-dashed px-1.5 py-0.5 text-xs font-normal text-muted-foreground">Mock data</span>;
}