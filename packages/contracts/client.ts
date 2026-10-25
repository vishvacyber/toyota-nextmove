import { useEffect, useState } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: !!path });
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState({ loading: true });
    api<T>(path).then(
      (data) => live && setState({ data, loading: false }),
      (error: Error) => live && setState({ error, loading: false }),
    );
    return () => { live = false; };
  }, [path]);
  return state;
}
