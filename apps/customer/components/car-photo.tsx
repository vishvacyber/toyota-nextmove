"use client";
import { PHOTOS } from "@/lib/cars";
import { useI18n } from "@/lib/i18n";
import type { Model } from "@nextmove/contracts";

/** A real, freely licensed photo of the model with its required credit (author, license, source). */
export function CarPhoto({ model, className = "", credit = true }: { model: Model; className?: string; credit?: boolean }) {
  const { t } = useI18n();
  const p = PHOTOS[model];
  return (
    <figure className="overflow-hidden rounded-3xl bg-surface">
      {/* className sizes the image only, so the required credit below is never cropped. */}
      <div className={className}>
        {/* Plain img: a remote Commons thumbnail, already sized; next/image would add nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.src} alt={p.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>
      {credit && (
        <figcaption className="px-4 py-2 text-xs text-muted">
          {t("photo_credit", { author: p.author })}{" "}
          <a href={p.licenseUrl} target="_blank" rel="noreferrer" className="underline">{p.license}</a>
          {" · "}
          <a href={p.page} target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a>
        </figcaption>
      )}
    </figure>
  );
}
