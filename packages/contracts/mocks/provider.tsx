"use client";
import { useEffect, useState, type ReactNode } from "react";

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING !== "disabled";

// Module-level so React dev mode's double effect can't start the worker twice.
let starting: Promise<unknown> | undefined;

/** Starts the MSW worker before rendering, so every fetch hits mocks (CLAUDE.md rule 8). */
export function MockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKING);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (ready) return;
    starting ??= import("./browser").then(({ worker }) => worker.start({ onUnhandledRequest: "bypass", quiet: true }));
    starting.then(() => setReady(true), (e: Error) => setError(e.message));
  }, [ready]);
  if (error) return <p role="alert" style={{ padding: 24 }}>Mock API failed to start: {error}</p>;
  return ready ? children : null;
}
