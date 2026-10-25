import { Summary } from "@/components/summary";

// Take-home summary from the kiosk QR: the inputs ride in the URL and the engine prices them again here.
export default async function SummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q.set(k, v);
  return <Summary query={q.toString()} />;
}
