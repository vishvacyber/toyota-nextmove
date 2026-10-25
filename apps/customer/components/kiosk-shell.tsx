"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { KioskContext } from "@/components/kiosk";
import { useI18n } from "@/lib/i18n";

const IDLE_MS = 60_000;

/** Full-screen kiosk wrapper: privacy blur on, and a 60s idle reset that signs the customer out and remounts the screen (re-blurring every number). */
export function KioskShell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(0);
  const [notice, setNotice] = useState(false);
  const { t, setLang } = useI18n();
  const router = useRouter();

  useEffect(() => {
    let timer = setTimeout(reset, IDLE_MS);
    function reset() {
      router.replace("/kiosk");
      setSession((s) => s + 1);
      setLang("en");
      // Speech is global and outlives the remount; the remount itself stops the camera and drops photos.
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      setNotice(true);
      window.scrollTo(0, 0);
    }
    function activity() {
      clearTimeout(timer);
      timer = setTimeout(reset, IDLE_MS);
      setNotice(false);
    }
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, activity));
    };
  }, [setLang, router]);

  return (
    <KioskContext.Provider value={true}>
      <div className="kiosk min-h-screen text-xl">
        {notice && <p role="status" className="sr-only">{t("idle_notice")}</p>}
        <div key={session}>{children}</div>
      </div>
    </KioskContext.Provider>
  );
}
