"use client";
import type { ReactNode } from "react";
import type { Scenario } from "@nextmove/contracts";
import { Private } from "@/components/private";
import { useI18n } from "@/lib/i18n";

export function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-surface p-6 ${className}`}>
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

export function ScenarioCard({ s, recommended, children }: { s: Scenario; recommended?: boolean; children?: ReactNode }) {
  const { t, money } = useI18n();
  return (
    <article className={`flex h-full flex-col rounded-3xl p-6 ${recommended ? "border-2 border-accent bg-bg shadow-xl shadow-accent/10" : "border border-line bg-surface"} ${s.eligible ? "" : "opacity-60"}`}>
      {recommended && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{t("recommended")}</p>}
      {/* Option labels are English-only until the Advisor returns localized text (B3). */}
      <h3 className={`font-semibold ${recommended ? "mt-2 text-2xl" : "mt-6 text-lg"}`}>{s.label}</h3>
      {s.target_vehicle && <p className="text-sm text-muted">{s.target_vehicle.year} {s.target_vehicle.model} {s.target_vehicle.trim}</p>}
      <p className="mt-4 text-sm text-muted">{t("monthly_payment")}</p>
      <p className={`font-semibold tabular-nums ${recommended ? "text-4xl" : "text-2xl"}`}><Private>{money(s.monthly_payment)}</Private></p>
      <dl className="mt-4 text-sm">
        <Row label={s.horizon_months ? t("total_cost_months", { months: s.horizon_months }) : t("total_cost")}><Private>{money(s.total_cost)}</Private></Row>
        <Row label={t("equity")}><Private>{money(s.equity)}</Private></Row>
        <Row label={t("fees")}><Private>{money(s.fees)}</Private></Row>
      </dl>
      {!s.eligible && s.ineligible_reason && <p className="mt-3 text-sm text-muted">{s.ineligible_reason}</p>}
      <div className="mt-auto">{children}</div>
    </article>
  );
}
