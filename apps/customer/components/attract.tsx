"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { NxtMark, TfsLogo } from "@nextmove/tokens";
import { HERO_MODELS, PHOTOS, sized } from "@/lib/cars";
import { useI18n } from "@/lib/i18n";

/** Kiosk attract loop: Toyota's own lifestyle photography, cross-fading. One tap anywhere starts. Reduced motion: one still photo. */
export function Attract({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % HERO_MODELS.length), 6000);
    return () => clearInterval(id);
  }, [reduce]);
  const p = PHOTOS[HERO_MODELS[i]];

  return (
    <div className="fixed inset-0 z-40 bg-black text-white">
      <AnimatePresence initial={false}>
        <motion.div
          key={p.name}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sized(p.hero!, 2400)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />
        </motion.div>
      </AnimatePresence>
      <div className="absolute left-8 top-8 flex items-center gap-3 text-white">
        <TfsLogo className="h-12 w-auto" />
        <span className="border-l border-white/40 pl-3"><NxtMark className="h-8 w-auto" /></span>
      </div>
      {/* The whole screen is the button; its label is the call to action. */}
      <button
        type="button"
        onClick={onStart}
        aria-label={t("attract_tap")}
        aria-describedby="attract-sub"
        className="absolute inset-0 flex flex-col items-start justify-end gap-5 px-10 pb-20 text-left sm:px-16"
      >
        <span className="max-w-3xl text-5xl font-medium leading-tight tracking-tight sm:text-6xl">{t("attract_title")}</span>
        <span id="attract-sub" className="max-w-xl text-xl text-white/85">{t("attract_sub")}</span>
        <span className="mt-2 inline-flex min-h-16 items-center rounded-lg bg-accent px-10 text-2xl font-medium text-on-accent shadow-xl shadow-black/30">
          {t("attract_tap")}
        </span>
      </button>
      <p className="absolute bottom-4 right-6 text-sm text-white/70">{p.name}</p>
    </div>
  );
}
