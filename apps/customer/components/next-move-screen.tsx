"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import type { Customer, Recommendation, Scenario } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { Private } from "@/components/private";
import { SignIn } from "@/components/sign-in";
import { TopBar } from "@/components/top-bar";
import { useI18n, type Key } from "@/lib/i18n";

const STEPS = ["step_situation", "step_next_move", "step_why"] as const;
const ease = [0.22, 1, 0.36, 1] as const;

/** Shared by /app and /kiosk: the kiosk only changes the shell around it. The signed-in customer lives in `?id=`, which is also the QR deep link. */
export function NextMoveScreen({ customerId }: { customerId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <MotionConfig reducedMotion="user">
      <TopBar onSignOut={customerId ? () => router.push(pathname) : undefined} />
      <AnimatePresence mode="wait">
        <motion.div
          key={customerId ?? "sign-in"}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.35, ease }}
        >
          {customerId
            ? <Flow id={customerId} onSignOut={() => router.push(pathname)} />
            : <SignIn onSignIn={(id) => router.push(`${pathname}?id=${encodeURIComponent(id)}`)} />}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}

function Flow({ id, onSignOut }: { id: string; onSignOut: () => void }) {
  const { t } = useI18n();
  const customer = useApi<Customer>(`/customers/${encodeURIComponent(id)}`);
  const rec = useApi<Recommendation>(`/customers/${encodeURIComponent(id)}/recommendation`);
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    // Move focus to the new step's title for screen readers, but not on first load.
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  const c = customer.data;
  const r = rec.data;
  if (customer.error || rec.error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p role="alert" className="text-xl">{t("not_found", { id })}</p>
        <button type="button" onClick={onSignOut} className="mt-6 rounded-full bg-accent px-6 py-3 font-semibold text-on-accent">{t("try_another")}</button>
      </main>
    );
  }
  if (!c || !r) return <p className="px-6 py-12 text-muted">{t("loading")}</p>;

  return (
    <main className="mx-auto max-w-6xl px-6 pb-16">
      <p className="text-sm font-medium text-muted">{t("hello", { name: c.first_name })}</p>
      <nav aria-label={t("steps")} className="mt-4">
        <ol className="flex gap-2 overflow-x-auto rounded-full bg-surface p-1">
          {STEPS.map((k, i) => (
            <li key={k} className="flex-1">
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
                className={`relative w-full whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${step === i ? "text-on-accent" : "text-muted hover:text-fg"}`}
              >
                {step === i && <motion.span layoutId="step-pill" className="absolute inset-0 rounded-full bg-accent" transition={{ duration: 0.35, ease }} />}
                <span className="relative">{i + 1}. {t(k)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <h1 ref={heading} tabIndex={-1} className="mt-8 text-4xl font-semibold tracking-tight outline-none sm:text-5xl">{t(STEPS[step])}</h1>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -32 }}
          transition={{ duration: 0.3, ease }}
          className="mt-6"
        >
          {step === 0 && <SituationStep c={c} r={r} />}
          {step === 1 && <NextMoveStep r={r} />}
          {step === 2 && <WhyStep r={r} />}
        </motion.div>
      </AnimatePresence>

      <div className="mt-10 flex justify-between gap-4">
        {step > 0
          ? <button type="button" onClick={() => setStep(step - 1)} className="rounded-full border border-line px-6 py-3 font-semibold">{t("back")}</button>
          : <span />}
        {step < STEPS.length - 1 && (
          <button type="button" onClick={() => setStep(step + 1)} className="rounded-full bg-accent px-8 py-3 font-semibold text-on-accent transition hover:brightness-110">
            {t(STEPS[step + 1])} →
          </button>
        )}
      </div>
    </main>
  );
}

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-surface p-6 ${className}`}>
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function SituationStep({ c, r }: { c: Customer; r: Recommendation }) {
  const { t, money, num, locale } = useI18n();
  const k = c.contract;
  // Contract dates are date-only, so format in UTC to avoid an off-by-one day.
  const date = (d: string) => new Date(d).toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  // Measured from the recommendation's as-of time, so the number matches what the engine used.
  const daysLeft = Math.round((Date.parse(k.maturity_date) - Date.parse(r.generated_at)) / 864e5);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <motion.section
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease }}
        aria-labelledby="detected"
        className="rounded-3xl bg-fg p-6 text-bg md:col-span-2"
      >
        <h2 id="detected" className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t("detected_situation")}</h2>
        <p className="mt-2 text-3xl font-semibold">{t(`sit_${r.situation}` as Key)}</p>
        <p className="mt-2 opacity-75">{t(`sit_${r.situation}_body` as Key)}</p>
      </motion.section>

      <Card title={t("your_vehicle")}>
        <p className="text-2xl font-semibold">{c.vehicle.year} {c.vehicle.model} {c.vehicle.trim}</p>
        <dl className="mt-3">
          <Row label={t("odometer")}>{t("miles", { miles: num(c.vehicle.odometer_miles) })}</Row>
          <Row label={t("powertrain")}>{t(`pt_${c.vehicle.powertrain}` as Key)}</Row>
          <Row label={t("color")}>{c.vehicle.color}</Row>
        </dl>
      </Card>

      <Card title={k.type === "lease" ? t("your_lease") : t("your_loan")}>
        <dl>
          <Row label={t("monthly_payment")}><Private>{money(k.monthly_payment)}</Private></Row>
          <Row label={t("apr")}>{num(k.apr)}%</Row>
          <Row label={t("payments_made")}>{t("of_n", { n: num(k.payments_made), total: num(k.term_months) })}</Row>
          <Row label={k.type === "lease" ? t("buyout_price") : t("payoff_amount")}>
            <Private>{money(k.type === "lease" && k.residual_value != null ? k.residual_value : k.payoff_amount)}</Private>
          </Row>
          {k.annual_mile_allowance != null && <Row label={t("mile_allowance")}>{t("miles_per_year", { miles: num(k.annual_mile_allowance) })}</Row>}
          {k.projected_miles_at_maturity != null && <Row label={t("projected_miles")}>{t("miles", { miles: num(k.projected_miles_at_maturity) })}</Row>}
        </dl>
      </Card>

      <Card title={t("key_dates")} className="md:col-span-2">
        <dl className="grid gap-x-8 md:grid-cols-2">
          <Row label={k.type === "lease" ? t("lease_end_date") : t("loan_end_date")}>
            {date(k.maturity_date)}
            {k.type === "lease" && <span className="block text-sm font-normal text-accent">{t("in_days", { days: daysLeft })}</span>}
          </Row>
          <Row label={t("payment_due")}>{t("due_day", { day: k.due_day })}</Row>
          {c.next_payday && <Row label={t("next_payday")}>{date(c.next_payday)}</Row>}
          <Row label={t("account_status")}>
            {k.days_past_due > 0
              ? <span className="text-accent">{t("days_past_due", { days: k.days_past_due })}</span>
              : t("status_current")}
          </Row>
        </dl>
      </Card>
    </div>
  );
}

function ScenarioCard({ s, recommended, children }: { s: Scenario; recommended?: boolean; children?: ReactNode }) {
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

function NextMoveStep({ r }: { r: Recommendation }) {
  const { t } = useI18n();
  // Guardian rule: a blocked recommendation never reaches the customer.
  if (r.guardian.verdict === "block") return <p role="status" className="text-xl">{t("under_review")}</p>;
  return (
    <div>
      <p className="text-2xl font-semibold leading-snug sm:text-3xl">{r.headline}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[r.recommended, ...r.alternatives].map((s, i) => (
          <motion.div key={s.option} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease, delay: 0.08 * i }}>
            <ScenarioCard s={s} recommended={i === 0}>
              {i === 0 && (
                <button type="button" className="mt-6 w-full rounded-full bg-accent px-6 py-3 font-semibold text-on-accent transition hover:brightness-110">
                  {r.action.label}
                </button>
              )}
            </ScenarioCard>
          </motion.div>
        ))}
      </div>
      {r.alternatives.length === 0 && <p className="mt-4 text-muted">{t("no_alternatives")}</p>}
    </div>
  );
}

function WhyStep({ r }: { r: Recommendation }) {
  const { t, locale } = useI18n();
  if (r.guardian.verdict === "block") return <p role="status" className="text-xl">{t("under_review")}</p>;
  const labelOf = (option: string) =>
    [r.recommended, ...r.alternatives, ...(r.baseline ? [r.baseline] : [])].find((s) => s.option === option)?.label ?? option.replace(/_/g, " ");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* The explanation quotes dollar amounts, so it gets the kiosk privacy blur too. */}
      <section aria-labelledby="why-text" className="rounded-3xl border-2 border-accent p-6 md:col-span-2">
        <h2 id="why-text" className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{r.recommended.label}</h2>
        <p className="mt-3 text-xl leading-relaxed sm:text-2xl"><Private>{r.why}</Private></p>
      </section>

      <Card title={t("why_not_others")}>
        <ul className="space-y-4">
          {r.why_not.map((w) => (
            <li key={w.option}>
              <p className="font-semibold">{labelOf(w.option)}</p>
              <p className="text-muted"><Private>{w.reason}</Private></p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("assumptions")}>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          {r.assumptions.map((a) => <li key={a}><Private>{a}</Private></li>)}
        </ul>
      </Card>

      <p className="text-sm text-muted md:col-span-2">
        {r.guardian.verdict === "pass" && <>{t("guardian_pass")} · </>}
        {t("calculated_at", { at: new Date(r.generated_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}
      </p>
    </div>
  );
}
