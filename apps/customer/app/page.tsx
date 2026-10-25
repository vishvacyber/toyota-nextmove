"use client";
import Link from "next/link";
import { TopBar } from "@/components/top-bar";
import { useI18n } from "@/lib/i18n";

export default function Landing() {
  const { t } = useI18n();
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">{t("tagline")}</h1>
        <div className="flex flex-wrap gap-4">
          <Link href="/app" className="rounded-lg bg-accent px-6 py-3 font-semibold text-on-accent">{t("phone_mode")}</Link>
          <Link href="/kiosk" className="rounded-lg border border-line px-6 py-3 font-semibold">{t("kiosk_mode")}</Link>
        </div>
      </main>
    </>
  );
}
