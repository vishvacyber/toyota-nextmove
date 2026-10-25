"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Customer, MarketQuote, Recommendation } from "@nextmove/contracts";
import { useApi } from "@nextmove/contracts/client";
import { SyntheticBadge } from "@nextmove/tokens";
import { Card } from "@/components/cards";
import type { Hotspot } from "@/components/showroom-canvas";
import { useI18n, type Key } from "@/lib/i18n";
import { COLORS, PARTS, trims, type Part } from "@/lib/showroom";

// three + R3F + drei stay out of the main bundle until the showroom opens.
const ShowroomCanvas = dynamic(() => import("@/components/showroom-canvas"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-muted">…</div>,
});

/** Hotspot anchors in model space, before the part's explode offset. */
const ANCHORS: Record<Part, [number, number, number]> = {
  body: [-1.6, 1.25, 0.95],
  powertrain: [1.45, 1.1, 0],
  battery: [-0.2, 0.55, 0.7],
  chassis: [1.35, 0.4, 1.0],
  interior: [-0.4, 1.2, 0],
};

/** K4: 3D showroom over the flow. Prices are the engine's scenario numbers; nothing is computed here. */
export function Showroom({ c, r, initial, onClose }: { c: Customer; r: Recommendation; initial: string; onClose: () => void }) {
  const { t, money, locale, lang } = useI18n();
  const options = trims(c, r);
  const [trimKey, setTrimKey] = useState(initial);
  const trim = options.find((o) => o.key === trimKey) ?? options[0];
  const [paint, setPaint] = useState<string>(COLORS.find((k) => k.name === trim.vehicle.color)?.hex ?? COLORS[0].hex);
  const [explode, setExplode] = useState(0);
  const [autoRotate, setAutoRotate] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [selected, setSelected] = useState<Part>();
  const market = useApi<MarketQuote>(`/market/${encodeURIComponent(trim.vehicle.model)}?year=${trim.vehicle.year}`);
  const dialog = useRef<HTMLDialogElement>(null);
  // Captured on first render, before the dialog takes focus, so closing returns focus to "Explore in 3D".
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    // Native modal dialog: focus trap, Esc and an inert background for free.
    dialog.current?.showModal();
    return () => opener?.focus();
  }, [opener]);

  const v = trim.vehicle;
  const car = `${v.year} ${v.model} ${v.trim}`;
  const colorName = COLORS.find((k) => k.hex === paint)?.name ?? "";
  const hotspots: Hotspot[] = PARTS.map((p) => ({ part: p, label: t(`hs_${p}` as Key), at: ANCHORS[p] }));

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
          <section aria-label={t("showroom_canvas")} aria-describedby="showroom-alt" className="relative h-[55vh] overflow-hidden rounded-3xl lg:h-[72vh]">
            <p id="showroom-alt" className="sr-only">{t("showroom_alt", { car, color: colorName, pct: Math.round(explode * 100) })}</p>
            <ShowroomCanvas
              paint={paint}
              explode={explode}
              autoRotate={autoRotate}
              onInteract={() => setAutoRotate(false)}
              hotspots={hotspots}
              selected={selected}
              onSelect={setSelected}
            />
          </section>

          <div className="grid content-start gap-4">
            <div aria-live="polite">
              {selected
                ? (
                  <Card title={t(`hs_${selected}` as Key)}>
                    <p>{t(`hs_${selected}_body` as Key)}</p>
                    {selected === "powertrain" && v.mpg != null && <p className="mt-2 font-semibold">{t("hs_mpg", { mpg: v.mpg })}</p>}
                  </Card>
                )
                : <p className="rounded-3xl bg-surface p-6 text-muted">{t("hs_hint")}</p>}
            </div>

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
                            ? <><>{money(o.scenario.monthly_payment)}</> {t("per_month")} · {o.scenario.label}</>
                            : t("price_na")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </Card>

            <Card title={t("color")}>
              <div role="radiogroup" aria-label={t("color")} className="flex flex-wrap gap-2">
                {COLORS.map((k) => (
                  <button
                    key={k.hex}
                    type="button"
                    role="radio"
                    aria-checked={paint === k.hex}
                    aria-label={k.name}
                    title={k.name}
                    onClick={() => setPaint(k.hex)}
                    className={`h-11 w-11 rounded-full border-2 ${paint === k.hex ? "border-accent ring-2 ring-accent ring-offset-2" : "border-line"}`}
                    style={{ background: k.hex }}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm text-muted">{colorName} · {t("color_unpriced")}</p>
            </Card>

            <Card title={t("view")}>
              <label className="block">
                <span className="flex justify-between font-medium"><span>{t("explode")}</span><span className="tabular-nums">{Math.round(explode * 100)}%</span></span>
                <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="mt-2 w-full accent-accent" />
              </label>
              <button type="button" aria-pressed={autoRotate} onClick={() => setAutoRotate(!autoRotate)} className="mt-4 rounded-full border border-line px-5 py-2 font-semibold">
                {autoRotate ? t("rotate_stop") : t("rotate_start")}
              </button>
              <p className="mt-2 text-sm text-muted">{t("orbit_hint")}</p>
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
