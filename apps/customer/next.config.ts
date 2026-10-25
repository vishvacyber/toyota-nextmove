import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Keys live in the repo-root .env.local; expose only the public Supabase pair to the browser (never the service key).
// forceReload: Next already loaded (and cached) the app folder's env before reading this file.
loadEnvConfig(path.resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", undefined, true);

const config: NextConfig = {
  transpilePackages: ["@nextmove/contracts", "@nextmove/tokens"],
  agentRules: false,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  },
  // One deployment, two front doors: toyotanxt.tech opens the kiosk, app.toyotanxt.tech the phone app. A redirect (not a
  // rewrite) keeps /kiosk and /app in the address bar, which the screens use for sign-in links and QR codes.
  async redirects() {
    return [
      { source: "/", has: [{ type: "host", value: "toyotanxt.tech" }], destination: "/kiosk", permanent: false },
      { source: "/", has: [{ type: "host", value: "app.toyotanxt.tech" }], destination: "/app", permanent: false },
    ];
  },
};
export default config;
