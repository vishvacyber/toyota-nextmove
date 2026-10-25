// One entry per console page (drives the sidebar). Pages without their own route render generically from their endpoints via app/[...slug]; C1 built /, /queue, /customers; C2 built /review, /live, /deal-packets, /approvals; C3 built /proof, /profit, /offers, /market; C4 built /traces, /responsible-ai, /studio.
export type NavPage = { slug: string; title: string; group: string; endpoints: string[] };

export const NAV: NavPage[] = [
  { group: "Portfolio", slug: "", title: "Command Center", endpoints: ["/kpis", "/opportunities"] },
  { group: "Portfolio", slug: "queue", title: "Opportunity Queue", endpoints: ["/opportunities"] },
  { group: "Portfolio", slug: "customers", title: "Customers", endpoints: ["/customers"] },
  { group: "Act", slug: "review", title: "NextMove Review", endpoints: ["/customers/CUST-MARIA/recommendation"] },
  { group: "Act", slug: "live", title: "Live Activity", endpoints: ["/sessions", "/handoffs"] },
  { group: "Act", slug: "deal-packets", title: "Deal Packets", endpoints: ["/deal-packets"] },
  { group: "Act", slug: "approvals", title: "Alert Approvals", endpoints: ["/alerts?status=pending_approval"] },
  { group: "Prove", slug: "proof", title: "Proof", endpoints: ["/kpis"] },
  { group: "Prove", slug: "profit", title: "Long-term Profit", endpoints: ["/kpis"] },
  { group: "Prove", slug: "offers", title: "Offer Studio", endpoints: ["/offers"] },
  { group: "Prove", slug: "market", title: "Market Intel", endpoints: ["/market/RAV4"] },
  { group: "Trust", slug: "traces", title: "Agent Traces", endpoints: ["/traces"] },
  { group: "Trust", slug: "responsible-ai", title: "Responsible AI", endpoints: ["/fairness", "/audit"] },
  { group: "Trust", slug: "studio", title: "Agent Studio", endpoints: ["/studio/agents"] },
];
