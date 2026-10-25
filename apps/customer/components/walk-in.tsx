"use client";
import { useEffect, useState } from "react";
import type { Estimate, Model } from "@nextmove/contracts";
import { api } from "@nextmove/contracts/client";
import { CarPhoto } from "@/components/car-photo";
import { Card, Row } from "@/components/cards";
import { ContinueOnPhone } from "@/components/continue-on-phone";
import { MODELS } from "@/lib/cars";
import { useI18n, type Key } from "@/lib/i18n";
import { DEFAULTS, toQuery, type Inputs } from "@/lib/walk-in";

export type Mode = "estimate" | "trade" | "compare";
const TERMS = [36, 48, 60, 72];
const TIERS = ["A", "B", "C", "D"] as const;
const name = (m: Model) => (m === "bZ" ? "bZ4X" : m);

/** POST /estimate whenever the inputs settle. Every number on screen comes back from the engine. */
export function useEstimate(i: Inputs) {
  // `key` is the inputs the result belongs to, so "loading" is simply: the result is for older inputs.
  const [state, setState] = useState<{ key?: string; data?: Estimate; error?: Error }>({});
  const key = JSON.stringify(i);
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      api<Estimate>("/estimate", { method: "POST", body: key }).then(
        (data) => live && setState({ key, data }),
        (error: Error) => live && setState({ key, error }),
      );
    }, 350);
    return () => { live = false; clearTimeout(id); };
  }, [key]);
  return { data: state.data, error: state.error, loading: state.key !== key };
}

/** Kiosk walk-in tools, no account: estimate a payment, value a trade-in, compare up to three cars. */
export function WalkIn({ mode, onBack }: { mode: Mode; onBack: () => void }) {
  const { t, money } = useI18n();
  const [i, setI] = useState<Inputs>(() => mode === "compare" ? { ...DEFAULTS, models: ["Camry", "RAV4", "bZ"] }
    : mode === "trade" ? { ...DEFAULTS, trade_in: { model: "Camry", year: 2021, odometer_miles: 45000, payoff: 9000 } } : DEFAULTS);
  const est = useEstimate(i);
  const set = (patch: Partial<Inputs>) => setI((x) => ({ ...x, ...patch }));
  const pick = (m: Model) => set({
    models: mode !== "compare" ? [m]
      : i.models.includes(m) ? (i.models.length > 1 ? i.models.filter((x) => x !== m) : i.models)
        : [...i.models, m].slice(-3),
  });
  const trade = i.trade_in;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16">
      <button type="button" onClick={onBack} className="min-h-12 rounded-lg border border-line px-6 font-semibold">← {t("back")}</button>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">{t(`walk_${mode}` as Key)}</h1>
      <p className="mt-2 text-lg text-muted">{t(`walk_${mode}_body` as Key)}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="grid content-start gap-6">
          {trade && (
            <Card title={t("walk_your_car")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("walk_model")}>
                  <select value={trade.model} onChange={(e) => set({ trade_in: { ...trade, model: e.target.value as Model } })} className={INPUT}>
                    {MODELS.map((m) => <option key={m} value={m}>{name(m)}</option>)}
                  </select>
                </Field>
                <Field label={t("walk_year")}>
                  <input type="number" inputMode="numeric" min={2005} max={2027} value={trade.year}
                    onChange={(e) => set({ trade_in: { ...trade, year: clamp(e.target.value, 2005, 2027) } })} className={INPUT} />
                </Field>
                <Field label={t("odometer")}>
                  <input type="number" inputMode="numeric" min={0} step={1000} value={trade.odometer_miles}
                    onChange={(e) => set({ trade_in: { ...trade, odometer_miles: clamp(e.target.value, 0, 400_000) } })} className={INPUT} />
                </Field>
                <Field label={t("walk_payoff")}>
                  <input type="number" inputMode="numeric" min={0} step={500} value={trade.payoff}
                    onChange={(e) => set({ trade_in: { ...trade, payoff: clamp(e.target.value, 0, 200_000) } })} className={INPUT} />
                </Field>
              </div>
            </Card>
          )}

          <Card title={mode === "compare" ? t("walk_pick_three") : trade ? t("walk_toward") : t("walk_pick_one")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MODELS.map((m) => (
                <button key={m} type="button" onClick={() => pick(m)} aria-pressed={i.models.includes(m)}
                  className={`overflow-hidden rounded-2xl border-2 text-left transition ${i.models.includes(m) ? "border-accent" : "border-transparent"}`}>
                  <CarPhoto model={m} className="aspect-[4/3]" />
                  <span className="block px-3 py-2 font-semibold">{name(m)}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card title={t("walk_terms")}>
            <Field label={`${t("walk_down")}: ${money(i.down_payment)}`}>
              <input type="range" min={0} max={20_000} step={500} value={i.down_payment}
                onChange={(e) => set({ down_payment: Number(e.target.value) })} className="w-full accent-accent" />
            </Field>
            <Segment label={t("walk_term")} options={TERMS.map((n) => [n, t("walk_months", { n })])} value={i.term_months}
              onChange={(n) => set({ term_months: n })} />
            <Segment label={t("walk_credit")} options={TIERS.map((c) => [c, t(`walk_credit_${c}` as Key)])} value={i.credit_tier}
              onChange={(c) => set({ credit_tier: c })} />
          </Card>
        </div>

        <div className="grid content-start gap-4 lg:sticky lg:top-4">
          <EstimateView est={est} compare={mode === "compare"} />
          {est.data && <ContinueOnPhone path={`/app/summary?${toQuery(i)}`} takeHome />}
        </div>
      </div>
    </main>
  );
}

/** The engine's numbers for each car (and the trade-in), with sources. Also the phone's take-home summary. */
export function EstimateView({ est, compare }: { est: ReturnType<typeof useEstimate>; compare?: boolean }) {
  const { t, money, num } = useI18n();
  const e = est.data;
  if (!e) return <p role="status" className={est.error ? "text-accent" : "animate-pulse text-muted"}>{est.error ? t("error") : t("loading")}</p>;
  const cheapest = Math.min(...e.vehicles.map((v) => v.five_year_cost));
  return (
    <div aria-live="polite" aria-busy={est.loading} className={`grid gap-4 transition-opacity ${est.loading ? "opacity-60" : ""}`}>
      {e.trade_in && (
        <Card title={t("walk_trade_value")}>
          <p className="text-4xl font-semibold tabular-nums">{money(e.trade_in.estimated_value)}</p>
          <dl className="mt-3">
            <Row label={t("walk_payoff")}>{money(e.trade_in.payoff)}</Row>
            <Row label={t("equity")}><span className={e.trade_in.equity < 0 ? "text-accent" : ""}>{money(e.trade_in.equity)}</span></Row>
          </dl>
          <p className="mt-2 text-sm text-muted">{t("source_as_of", { source: e.trade_in.source, at: e.trade_in.as_of })}</p>
        </Card>
      )}
      <div className={`grid gap-4 ${compare && e.vehicles.length > 1 ? "sm:grid-cols-2 lg:grid-cols-1" : ""}`}>
        {e.vehicles.map((v) => (
          <article key={v.vehicle.model}
            className={`rounded-2xl p-5 ${compare && e.vehicles.length > 1 && v.five_year_cost === cheapest ? "border-2 border-accent bg-bg" : "bg-surface"}`}>
            {compare && e.vehicles.length > 1 && v.five_year_cost === cheapest && (
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{t("walk_lowest")}</p>
            )}
            <h3 className="text-xl font-semibold">{v.vehicle.year} {name(v.vehicle.model)} {v.vehicle.trim}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-muted">{t("walk_loan")}</p>
                <p className="text-3xl font-semibold tabular-nums">{money(v.loan_payment)}<span className="text-base font-normal text-muted">{t("per_month")}</span></p>
              </div>
              <div>
                <p className="text-sm text-muted">{t("walk_lease", { n: v.lease_term_months })}</p>
                <p className="text-3xl font-semibold tabular-nums">{money(v.lease_payment)}<span className="text-base font-normal text-muted">{t("per_month")}</span></p>
              </div>
            </div>
            <dl className="mt-3 text-sm">
              <Row label={t("walk_five_year")}>{money(v.five_year_cost)}</Row>
              <Row label={t("walk_fuel")}>{money(v.true_cost.fuel)}{t("per_month")}</Row>
              <Row label="CO₂">{t("walk_co2", { kg: num(v.true_cost.co2_kg_per_year) })}</Row>
              <Row label={t("walk_msrp")}>{money(v.msrp)} · {num(v.apr)}% APR</Row>
            </dl>
            <p className="mt-2 text-xs text-muted">{v.msrp_source}</p>
          </article>
        ))}
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{e.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
    </div>
  );
}

const INPUT = "min-h-14 w-full rounded-2xl border border-line bg-bg px-4 text-lg";
const clamp = (s: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(s) || 0)));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block first:mt-0"><span className="mb-1 block font-medium text-muted">{label}</span>{children}</label>;
}

function Segment<T extends string | number>({ label, options, value, onChange }:
  { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
            className={`min-h-14 rounded-lg border px-5 font-semibold ${v === value ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
