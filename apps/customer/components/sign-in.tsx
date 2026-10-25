"use client";
import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { normalizeId } from "@/lib/ids";
import { useI18n } from "@/lib/i18n";

/** Sign in by customer ID (a name alone isn't enough: that's what the voice line's name + car check is for), QR deep link (`?id=CUST-…`, handled by the page), or learn more as a guest. */
export function SignIn({ onSignIn }: { onSignIn: (id: string) => void }) {
  const { t } = useI18n();
  const [guest, setGuest] = useState(false);
  const [value, setValue] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const id = normalizeId(value);
    if (id) onSignIn(id);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-6 sm:pt-12">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">{t("sign_in_eyebrow")}</p>
      <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{t("tagline")}</h1>

      <AnimatePresence initial={false}>
        {guest && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-8 grid gap-3 overflow-hidden sm:grid-cols-3"
          >
            {(["guest_point_1", "guest_point_2", "guest_point_3"] as const).map((k) => (
              <li key={k} className="rounded-xl bg-surface p-5 text-muted">{t(k)}</li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      <form onSubmit={submit} className="mt-10 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <label htmlFor="customer-id" className="block text-lg font-semibold">{t("customer_id")}</label>
        <p id="customer-id-hint" className="mt-1 text-sm text-muted">{t("customer_id_hint")}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            id="customer-id"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby="customer-id-hint"
            autoComplete="off"
            spellCheck={false}
            className="min-h-14 flex-1 rounded-lg border border-line bg-bg px-5 text-lg"
          />
          <button type="submit" className="btn-primary">{t("continue")}</button>
        </div>
        <p className="mt-4 text-sm text-muted">{t("qr_hint")}</p>
      </form>

      <button type="button" onClick={() => setGuest((g) => !g)} aria-expanded={guest} className="mt-8 font-medium text-muted underline underline-offset-4">
        {guest ? t("guest_hide") : t("guest")}
      </button>
    </main>
  );
}
