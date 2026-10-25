"use client";
import { SyntheticBadge } from "@nextmove/tokens";
import { useI18n } from "@/lib/i18n";

export function TopBar() {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4">
      <span className="text-lg font-semibold"><span className="text-accent">Toyota</span> NextMove</span>
      <div className="flex items-center gap-3">
        <SyntheticBadge lang={lang} />
        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "es" : "en")}
          aria-label={`${t("language")}: ${lang === "en" ? "English" : "Español"}`}
          className="rounded-full border border-line px-3 py-1 text-sm font-medium"
        >
          {lang === "en" ? "ES" : "EN"}
        </button>
      </div>
    </header>
  );
}
