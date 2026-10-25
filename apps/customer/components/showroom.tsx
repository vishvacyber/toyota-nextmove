"use client";
import { useEffect, useRef, useState } from "react";
import type { Customer, MarketQuote, Recommendation } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { SyntheticBadge } from "@nextmove/tokens";
import { CarPhoto } from "@/components/car-photo";
import { Card } from "@/components/cards";
import { useI18n, type Key } from "@/lib/i18n";
import { FEATURES, trims, type Feature } from "@/lib/showroom";

/** Showroom over the flow: a real photo of each trim's model, its price from the engine's scenario, what each part
 * does, and what reviewers say (SerpApi, with source + as-of). Nothing is computed here. */
export function Showroom({ c, r, initial, onClose }: { c: Customer; r: Recommendation; initial: string; onClose: () => void }) {
  const { t, money, locale, lang } = useI18n();
  const options = trims(c, r);
  const [trimKey, setTrimKey] = useState(initial);
  const trim = options.find((o) => o.key === trimKey) ?? options[0];
  const [selected, setSelected] = useState<Feature>(FEATURES[0]);
  const market = useApi<MarketQuote>(`/market/${encodeURIComponent(trim.vehicle.model)}?year=${trim.vehicle.year}`);
  const dialog = useRef<HTMLDialogElement>(null);
  // Captured on first render, before the dialog takes focus, so closing returns focus to the opener.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    // Native modal dialog: focus trap, Esc and an inert background for free.
    dialog.current?.showModal();
    return () => opener?.focus();
  }, [opener]);

  const v = trim.vehicle;
  const car = `${v.year} ${v.model} ${v.trim}`;

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      aria-labelledby="showroom-title"
      className="m-0 h-full max-h-none w-full max-w-none bg-bg p-0 text-fg backdrop:bg-fg/40"
    >
      <div className="mx-auto max-w-7xl px-6 py-4">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t("showroom")}</p>
            <h2 id="showroom-title" className="text-3xl font-semibold tracking-tight">{car}</h2>
          </div>
          <div className="flex items-center gap-3">
            <SyntheticBadge lang={lang} />
            <button type="button" onClick={onClose} className="rounded-full border border-line px-6 py-3 font-semibold">{t("close")}</button>
          </div>
        </header>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="grid content-start gap-4">
            <CarPhoto key={v.model} model={v.model} className="aspect-[16/9]" />
            <Card title={t("features")}>
              <div role="tablist" aria-label={t("features")} className="flex flex-wrap gap-2">
                {FEATURES.map((f) => (
                  <button key={f} type="button" role="tab" aria-selected={selected === f} onClick={() => setSelected(f)}
                    className={`rounded-full border px-4 py-2 font-semibold ${selected === f ? "border-accent bg-accent text-on-accent" : "border-line"}`}>
                    {t(`hs_${f}` as Key)}
                  </button>
                ))}
              </div>
              <div role="tabpanel" aria-live="polite" className="mt-4">
                <p>{t(`hs_${selected}_body` as Key)}</p>
                {selected === "powertrain" && v.mpg != null && <p className="mt-2 font-semibold">{t("hs_mpg", { mpg: v.mpg })}</p>}
              </div>
            </Card>
          </div>

          <div className="grid content-start gap-4">
            <Card title={t("trim")}>
              <fieldset>
                <legend className="sr-only">{t("trim")}</legend>
                <div className="grid gap-2">
                  {options.map((o) => (
                    <label key={o.key} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${o.key === trim.key ? "border-accent" : "border-line"}`}>
                      <input type="radio" name="trim" checked={o.key === trim.key} onChange={() => setTrimKey(o.key)} className="accent-accent" />
                      <span className="flex-1">
                        <span className="block font-semibold">{o.vehicle.year} {o.vehicle.model} {o.vehicle.trim}</span>
                        <span className="block text-sm text-muted">
                          {o.scenario
                            ? <>{money(o.scenario.monthly_payment)} {t("per_month")} · {o.scenario.label}</>
                            : t("price_na")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </Card>

            <Card title={t("reviewers_say")}>
              {market.data
                ? (
                  <>
                    <p>{market.data.reviews_summary ?? t("reviews_none")}</p>
                    <p className="mt-2 text-sm text-muted">
                      {t("source_as_of", { source: market.data.source, at: new Date(market.data.as_of).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}
                    </p>
                  </>
                )
                : <p className="text-muted">{market.error ? t("reviews_none") : t("loading")}</p>}
            </Card>
          </div>
        </div>
      </div>
    </dialog>
  );
}
