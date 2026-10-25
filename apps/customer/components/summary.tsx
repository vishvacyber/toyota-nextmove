"use client";
import { TopBar } from "@/components/top-bar";
import { EstimateView, useEstimate } from "@/components/walk-in";
import { useI18n } from "@/lib/i18n";
import { fromQuery } from "@/lib/walk-in";

/** Phone take-home view of a kiosk estimate (no account): same engine call, no QR. */
export function Summary({ query }: { query: string }) {
  const { t } = useI18n();
  const inputs = fromQuery(new URLSearchParams(query));
  const est = useEstimate(inputs);
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-6 pb-16">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t("take_home")}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{t("summary_title")}</h1>
        <p className="mt-2 text-muted">{t("summary_body")}</p>
        <div className="mt-6"><EstimateView est={est} compare={inputs.models.length > 1} /></div>
      </main>
    </>
  );
}
