"use client";
import { useRef, useState } from "react";
import { encode } from "uqr";
import { useI18n } from "@/lib/i18n";

/** Kiosk → phone handoff: a QR of the `/app?id=` deep link, encoded on the device so the id never goes to a third-party QR service. */
export function ContinueOnPhone({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string>();

  function open() {
    // shortcut: the kiosk's own origin; a real kiosk needs an origin phones can reach (DECISIONS K5).
    setUrl(`${location.origin}/app?id=${encodeURIComponent(customerId)}`);
    dialog.current?.showModal();
  }

  const qr = url ? encode(url, { border: 2 }) : undefined;
  return (
    <>
      <button type="button" onClick={open} className="rounded-full border border-line px-6 py-3 font-semibold">
        📱 {t("continue_phone")}
      </button>
      <dialog ref={dialog} aria-labelledby="phone-title" className="m-auto max-w-md rounded-3xl bg-bg p-8 text-fg backdrop:bg-fg/40">
        <h2 id="phone-title" className="text-2xl font-semibold">{t("continue_phone")}</h2>
        <p className="mt-2 text-muted">{t("continue_phone_body")}</p>
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
          <button className="w-full rounded-full bg-accent px-6 py-3 font-semibold text-on-accent">{t("close")}</button>
        </form>
      </dialog>
    </>
  );
}
