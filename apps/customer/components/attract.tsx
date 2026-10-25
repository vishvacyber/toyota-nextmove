"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { SyntheticBadge } from "@nextmove/tokens";
import { useI18n } from "@/lib/i18n";
import { COLORS } from "@/lib/showroom";

// Same lazy K4 canvas as the showroom: three + R3F load only on the kiosk's idle screen.
const ShowroomCanvas = dynamic(() => import("@/components/showroom-canvas"), { ssr: false });

/** Kiosk attract loop: the K4 car turning while the paint cycles. One tap anywhere starts. Reduced motion: a still car. */
export function Attract({ onStart }: { onStart: () => void }) {
  const { t, lang } = useI18n();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % COLORS.length), 4000);
    return () => clearInterval(id);
  }, [reduce]);

  return (
    <div className="fixed inset-0 z-40 bg-[#f2f2f0] text-[#16171a]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <ShowroomCanvas paint={COLORS[i].hex} explode={0} autoRotate={!reduce} onInteract={() => {}} hotspots={[]} onSelect={() => {}} />
      </div>
      <div className="absolute right-6 top-6"><SyntheticBadge lang={lang} /></div>
      {/* The whole screen is the button; its label is the call to action. */}
      <button
        type="button"
        onClick={onStart}
        aria-label={t("attract_tap")}
        aria-describedby="attract-sub"
        className="absolute inset-0 flex flex-col items-center justify-end gap-4 px-6 pb-20 text-center"
      >
        <span className="text-lg font-semibold"><span className="text-accent">Toyota</span> NextMove</span>
        <span className="rounded-full bg-accent px-10 py-5 text-3xl font-semibold text-on-accent shadow-xl shadow-accent/20 sm:text-4xl">
          {t("attract_tap")}
        </span>
        <span id="attract-sub" className="max-w-xl text-lg text-[#4b4f55]">{t("attract_sub")}</span>
      </button>
    </div>
  );
}
