"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

export const PrivacyContext = createContext(false);

/** In kiosk mode, numbers stay blurred until tapped (CLAUDE.md look and feel). */
export function Private({ children }: { children: ReactNode }) {
  const blurOn = useContext(PrivacyContext);
  const [shown, setShown] = useState(false);
  const { t } = useI18n();
  if (!blurOn || shown) return <>{children}</>;
  return (
    <button type="button" onClick={() => setShown(true)} aria-label={t("tap_to_reveal")} title={t("tap_to_reveal")} className="rounded-md text-left">
      <span aria-hidden className="select-none blur-md">{children}</span>
    </button>
  );
}
