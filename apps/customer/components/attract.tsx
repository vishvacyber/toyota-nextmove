"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SyntheticBadge } from "@nextmove/tokens";
import { MODELS, PHOTOS } from "@/lib/cars";
import { useI18n } from "@/lib/i18n";

/** Kiosk attract loop: real photos of the Toyota line-up, cross-fading. One tap anywhere starts. Reduced motion: one still photo. */
export function Attract({ onStart }: { onStart: () => void }) {
  const { t, lang } = useI18n();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % MODELS.length), 5000);
    return () => clearInterval(id);
  }, [reduce]);
  const p = PHOTOS[MODELS[i]];

  return (
    <div className="fixed inset-0 z-40 bg-[#111214] text-white">
      <AnimatePresence initial={false}>
        <motion.div
          key={p.src}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.src} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />
        </motion.div>
      </AnimatePresence>
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
        <span id="attract-sub" className="max-w-xl text-lg text-white/85">{t("attract_sub")}</span>
      </button>
      <p className="absolute bottom-3 left-4 text-xs text-white/70">
        {MODELS[i] === "bZ" ? "Toyota bZ4X" : `Toyota ${MODELS[i]}`} · {t("photo_credit", { author: p.author })} {p.license}, Wikimedia Commons
      </p>
    </div>
  );
}
