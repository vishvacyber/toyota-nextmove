import type { NextConfig } from "next";

const config: NextConfig = { transpilePackages: ["@nextmove/contracts", "@nextmove/tokens"], agentRules: false };
export default config;
