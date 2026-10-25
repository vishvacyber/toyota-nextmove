import { useEffect, useState } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Carries the HTTP status, so screens can tell "busy, retry" (503) from "not found" (404). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export const isBusy = (e: unknown) => e instanceof ApiError && e.status === 503;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new ApiError(`${init?.method ?? "GET"} ${path} → ${res.status}`, res.status);
  return res.json() as Promise<T>;
}

const BUSY_RETRIES = 3;
const BUSY_WAIT_MS = 5000;

/** Fetch on mount. A 503 means the AI is still writing a checked answer: wait and retry a few times, then expose
 * the error with `retry()` for a button. `busy` is true while those automatic retries are pending. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean; busy?: boolean }>({ loading: !!path });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = (tries: number) =>
      api<T>(path).then(
        (data) => live && setState({ data, loading: false }),
        (error: Error) => {
          if (!live) return;
          if (isBusy(error) && tries < BUSY_RETRIES) {
            setState({ loading: true, busy: true });
            timer = setTimeout(() => run(tries + 1), BUSY_WAIT_MS);
          } else setState({ error, loading: false });
        },
      );
    setState({ loading: true });
    run(0);
    return () => { live = false; clearTimeout(timer); };
  }, [path, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
