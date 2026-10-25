"use client";
import { useState } from "react";
import type { Model } from "@nextmove/contracts";
import { PHOTOS, sized } from "@/lib/cars";

/** Toyota's own studio shot of the model on a soft showroom backdrop (toyota.com style). */
export function CarPhoto({ model, className = "" }: { model: Model; className?: string }) {
  const p = PHOTOS[model];
  const [broken, setBroken] = useState(false);
  return (
    <div className={`overflow-hidden rounded-xl bg-gradient-to-b from-surface to-bg ${className}`}>
      {/* Plain img: Toyota's CDN already resizes; next/image would only proxy it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={broken ? p.fallback : sized(p.studio, 960, true)}
        alt={p.name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={`h-full w-full ${broken ? "object-cover" : "object-contain p-3"}`}
      />
    </div>
  );
}
