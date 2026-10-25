// Display-only formatting. Every number shown comes from the API/engine; nothing is computed here.
export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
export const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
export const asOf = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
