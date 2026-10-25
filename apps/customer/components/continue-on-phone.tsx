"use client";
import { useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { encode } from "uqr";
import { useI18n } from "@/lib/i18n";

/** Kiosk → phone: a QR of a phone-app link (`/app?id=` to continue, `/app/summary?…` to take an estimate home), encoded on
 * the device so nothing goes to a third-party QR service. */
export function ContinueOnPhone({ path, takeHome = false }: { path: string; takeHome?: boolean }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string>();

  function open() {
    // A laptop kiosk runs on localhost, which a phone can't open, so NEXT_PUBLIC_PHONE_URL can point at the public site.
    const base = process.env.NEXT_PUBLIC_PHONE_URL || location.origin;
    setUrl(`${base}${path}`);
    dialog.current?.showModal();
  }

  const qr = url ? encode(url, { border: 2 }) : undefined;
  return (
    <>
      <button type="button" onClick={open} className="btn-outline">
        <Smartphone aria-hidden className="h-5 w-5" /> {t(takeHome ? "take_home" : "continue_phone")}
      </button>
      <dialog ref={dialog} aria-labelledby="phone-title" className="m-auto max-w-md rounded-2xl bg-bg p-8 text-fg backdrop:bg-fg/40">
        <h2 id="phone-title" className="text-2xl font-semibold">{t(takeHome ? "take_home" : "continue_phone")}</h2>
        <p className="mt-2 text-muted">{t(takeHome ? "take_home_body" : "continue_phone_body")}</p>
        {qr && (
          <svg role="img" aria-label={t("qr_alt")} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" className="mx-auto mt-6 aspect-square w-72 rounded-xl bg-white">
            <path
              fill="#000"
              d={qr.data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ""))).join("")}
            />
          </svg>
        )}
        <p className="mt-4 break-all text-center text-sm text-muted">{url}</p>
        <form method="dialog" className="mt-6">
          <button className="w-full rounded-lg bg-accent px-6 py-3 font-semibold text-on-accent">{t("close")}</button>
        </form>
      </dialog>
    </>
  );
}
