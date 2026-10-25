"use client";
import type { Customer, Recommendation } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { Private } from "@/components/private";
import { TopBar } from "@/components/top-bar";
import { useI18n } from "@/lib/i18n";

// K0 loads Maria by default; K1 adds sign-in by ID / QR / guest.
const DEFAULT_CUSTOMER = "CUST-MARIA";

/** Shared by /app and /kiosk: the kiosk only changes the shell around it. */
export function NextMoveScreen({ customerId = DEFAULT_CUSTOMER }: { customerId?: string }) {
  const { t, money, num, locale } = useI18n();
  const customer = useApi<Customer>(`/customers/${customerId}`);
  const rec = useApi<Recommendation>(`/customers/${customerId}/recommendation`);
  const c = customer.data;
  const r = rec.data;

  if (customer.error || rec.error) return <><TopBar /><p role="alert" className="p-6">{t("error")}</p></>;
  if (!c || !r) return <><TopBar /><p className="p-6 text-muted">{t("loading")}</p></>;

  // Measured from the recommendation's as-of time, so the number matches what the engine used.
  const daysLeft = Math.round((Date.parse(c.contract.maturity_date) - Date.parse(r.generated_at)) / 864e5);
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl space-y-8 px-6 pb-16">
        <h1 className="text-4xl font-semibold tracking-tight">{t("hello", { name: c.first_name })}</h1>

        <section aria-labelledby="vehicle" className="rounded-2xl bg-surface p-6">
          <h2 id="vehicle" className="text-sm font-medium uppercase tracking-wide text-muted">{t("your_vehicle")}</h2>
          <p className="mt-2 text-2xl font-semibold">{c.vehicle.year} {c.vehicle.model} {c.vehicle.trim}</p>
          <p className="text-muted">{t("miles", { miles: num(c.vehicle.odometer_miles) })}</p>
          <div className="mt-4 flex flex-wrap gap-8">
            <div>
              <div className="text-sm text-muted">{t("monthly_payment")}</div>
              <div className="text-2xl font-semibold tabular-nums"><Private>{money(c.contract.monthly_payment)}</Private></div>
            </div>
            <div className="self-end text-muted">
              {c.contract.type === "lease"
                ? t("lease_ends", { days: daysLeft })
                : t("loan_ends", { date: new Date(c.contract.maturity_date).toLocaleDateString(locale) })}
            </div>
          </div>
        </section>

        <section aria-labelledby="next-move" className="rounded-2xl border-2 border-accent p-6">
          <h2 id="next-move" className="text-sm font-medium uppercase tracking-wide text-accent">{t("your_next_move")}</h2>
          {/* Recommendation copy is English-only until the Advisor returns localized text (K1/B3). */}
          <p className="mt-2 text-3xl font-semibold">{r.headline}</p>
          <h3 className="mt-6 font-medium">{t("why_this")}</h3>
          {/* The explanation quotes dollar amounts, so it gets the kiosk privacy blur too. */}
          <p className="mt-1 text-left text-muted"><Private>{r.why}</Private></p>
          <button type="button" className="mt-6 rounded-full bg-accent px-6 py-3 font-semibold text-on-accent">
            {r.action.label}
          </button>
        </section>
      </main>
    </>
  );
}
