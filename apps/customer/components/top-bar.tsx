"use client";
import { TfsLogo } from "@nextmove/tokens";
import { useI18n } from "@/lib/i18n";

export function TopBar({ onSignOut }: { onSignOut?: () => void }) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
      <span className="flex items-center gap-3">
        <TfsLogo className="h-10 w-auto" />
        <span className="border-l border-line pl-3 text-base font-medium tracking-wide">NextMove</span>
      </span>
      <div className="flex items-center gap-3">
        {onSignOut && <button type="button" onClick={onSignOut} className="btn-outline btn-sm">{t("sign_out")}</button>}
        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "es" : "en")}
          aria-label={`${t("language")}: ${lang === "en" ? "English" : "Español"}`}
          className="btn-outline btn-sm"
        >
          {lang === "en" ? "Español" : "English"}
        </button>
      </div>
    </header>
  );
}
