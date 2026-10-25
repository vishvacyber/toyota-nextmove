import type { AgentTrace, StudioAgent } from "@nextmove/contracts";

// Kept import-free of runtime code so node --test can run it.

/** SPEC §4 tool registry. */
export const TOOLS = [
  "get_customer", "run_scenario", "check_eligibility", "get_market_value", "find_dealer", "get_recalls",
  "book_appointment", "create_offer_draft", "handoff_to_human", "log_decision", "inspect_photos", "get_timing",
] as const;

export type Template = StudioAgent["template"];

/** Studio templates: default name and pre-attached tools. */
export const TEMPLATES: Record<Template, { name: string; tools: string[] }> = {
  recall_notifier: { name: "Recall Notifier", tools: ["get_customer", "get_recalls", "find_dealer", "book_appointment", "log_decision"] },
  lease_end_nudge: { name: "Lease-end Nudge", tools: ["get_customer", "run_scenario", "get_market_value", "get_timing", "log_decision"] },
  rate_drop_alert: { name: "Rate-drop Alert", tools: ["get_customer", "run_scenario", "check_eligibility", "create_offer_draft", "log_decision"] },
  custom: { name: "Custom agent", tools: [] },
};

/** L4 (money/credit) is humans-only: never shown as executed by an agent, whatever the status says. */
export const actionStatus = ({ autonomy_level, status }: AgentTrace["action"]) =>
  autonomy_level === "L4" ? "Escalated to human" : status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
