"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import en from "@/i18n/en.json";
import es from "@/i18n/es.json";

const STRINGS = { en, es } satisfies Record<string, typeof en>;
export type Lang = keyof typeof STRINGS;
export type Key = keyof typeof en;

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const { lang, setLang } = useContext(Ctx);
  const t = (key: Key, vars: Record<string, string | number> = {}) =>
    STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
  const locale = lang === "es" ? "es-US" : "en-US";
  const money = (n: number) => n.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const num = (n: number) => n.toLocaleString(locale);
  return { lang, setLang, t, money, num, locale };
}
