import path from "node:path";
import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

// Keys live in the repo-root .env.local; Next only reads env files from the app folder (forceReload: Next already cached that load).
loadEnvConfig(path.resolve(process.cwd(), "../.."), undefined, undefined, true);

const config: NextConfig = {
  transpilePackages: ["@nextmove/contracts", "@nextmove/tokens"],
  agentRules: false,
  // Only the public anon key reaches the browser; never map SUPABASE_SERVICE_KEY here.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  },
};
export default config;
