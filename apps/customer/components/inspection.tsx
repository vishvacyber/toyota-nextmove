"use client";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InspectionResult } from "@nextmove/contracts";
import { api, isBusy } from "@nextmove/contracts/client";
import { Card } from "@/components/cards";
import { boxStyle } from "@/lib/box";
import { useI18n, type Key } from "@/lib/i18n";

const ANGLES = ["front", "rear", "left", "right", "interior", "wheels"] as const;
type Angle = (typeof ANGLES)[number];
type Photo = { blob: Blob; url: string };

/** Lease-end pre-inspection. Photos live only in this component's state until upload; unmount (sign-out, kiosk reset) stops the camera and drops them. */
export function Inspection({ customerId }: { customerId: string }) {
  const { t, money } = useI18n();
  const [photos, setPhotos] = useState<Partial<Record<Angle, Photo>>>({});
  const [i, setI] = useState(0);
  const [camera, setCamera] = useState<"off" | "on" | "failed">("off");
  const [phase, setPhase] = useState<"capture" | "busy" | "error" | "ai_busy">("capture");
  const [result, setResult] = useState<InspectionResult>();
  // Kept for the result view only; revoked on unmount.
  const [shown, setShown] = useState<Partial<Record<Angle, string>>>({});
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const urls = useRef(new Set<string>());
  const angle = ANGLES[i];

  function stopCamera() {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    setCamera((c) => (c === "on" ? "off" : c));
  }

  useEffect(() => {
    const all = urls.current;
    return () => {
      stream.current?.getTracks().forEach((tr) => tr.stop());
      all.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    if (camera === "on" && video.current) video.current.srcObject = stream.current;
  }, [camera]);

  async function startCamera() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setCamera("on");
    } catch {
      setCamera("failed");
    }
  }

  function keep(blob: Blob) {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    setPhotos((p) => ({ ...p, [angle]: { blob, url } }));
    if (i < ANGLES.length - 1) setI(i + 1);
  }

  function snap() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob((b) => b && keep(b), "image/jpeg", 0.85);
  }

  async function submit() {
    stopCamera();
    setPhase("busy");
    const form = new FormData();
    form.append("customer_id", customerId);
    for (const a of ANGLES) {
      const p = photos[a];
      if (p) { form.append("photos", p.blob, `${a}.jpg`); form.append("angles", a); }
    }
    try {
      const res = await api<InspectionResult>("/inspections", { method: "POST", body: form });
      // Drop the blobs; keep only the preview URLs to draw the marked items.
      setShown(Object.fromEntries(Object.entries(photos).map(([a, p]) => [a, p.url])));
      setPhotos({});
      setResult(res);
    } catch (e) {
      setPhase(isBusy(e) ? "ai_busy" : "error");   // photos stay, so "Get estimate" retries the same set
    }
  }

  const count = Object.keys(photos).length;

  if (result) {
    const byAngle = ANGLES.filter((a) => result.items.some((it) => it.angle === a));
    const no = new Map(result.items.map((it, k) => [it, k + 1]));
    return (
      <Card title={t("inspection_title")}>
        <div className="flex flex-wrap items-center gap-3">
          {result.is_estimate && <span className="rounded-lg bg-accent px-3 py-1 text-sm font-semibold text-on-accent">{t("estimate")}</span>}
          <p className="text-2xl font-semibold">{t("inspection_total")} <>{money(result.total_estimated_charge)}</></p>
        </div>
        <p role="note" className="mt-2 text-muted">{result.disclaimer}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {byAngle.map((a) => {
            const items = result.items.filter((it) => it.angle === a);
            return (
              <section key={a} aria-label={t(`angle_${a}` as Key)} className="rounded-2xl border border-line p-4">
                <h3 className="font-semibold">{t(`angle_${a}` as Key)}</h3>
                {shown[a] && (
                  <div className="relative mt-2 overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not an optimizable asset */}
                    <img src={shown[a]} alt={t("photo_of", { angle: t(`angle_${a}` as Key) })} className="block w-full" />
                    {items.map((it) => it.box && (
                      <span key={no.get(it)} aria-hidden style={boxStyle(it.box)} className="absolute rounded-md border-4 border-accent">
                        <span className="absolute -left-1 -top-7 rounded bg-accent px-2 text-sm font-bold text-on-accent">{no.get(it)}</span>
                      </span>
                    ))}
                  </div>
                )}
                <ol className="mt-3 space-y-2">
                  {items.map((it) => (
                    <li key={no.get(it)} className="flex justify-between gap-4 border-t border-line pt-2 first:border-t-0">
                      <span><span className="font-semibold">{no.get(it)}. {it.area}</span> <span className="text-muted">· {it.issue} · {t(`sev_${it.severity}` as Key)}</span></span>
                      <span className="font-semibold tabular-nums"><>{money(it.estimated_charge)}</></span>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
        {!result.items.length && <p className="mt-4">{t("inspection_none")}</p>}
      </Card>
    );
  }

  return (
    <Card title={t("inspection_title")}>
      <section aria-labelledby="capture-angle">
        <p className="text-muted">{t("inspection_body")}</p>
        <ol aria-label={t("inspection_progress")} className="mt-4 flex flex-wrap gap-2">
          {ANGLES.map((a, k) => (
            <li key={a}>
              <button
                type="button"
                onClick={() => setI(k)}
                aria-current={k === i ? "step" : undefined}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${k === i ? "bg-accent text-on-accent" : photos[a] ? "bg-fg text-bg" : "border border-line"}`}
              >
                {photos[a] && <Check aria-hidden className="mr-1 inline h-4 w-4" />}{t(`angle_${a}` as Key)}
              </button>
            </li>
          ))}
        </ol>
        <h3 id="capture-angle" aria-live="polite" className="mt-6 text-2xl font-semibold">
          {t("capture_prompt", { n: i + 1, angle: t(`angle_${angle}` as Key) })}
        </h3>
        <p className="text-muted">{t(`angle_${angle}_tip` as Key)}</p>

        {camera === "on" && (
          <video ref={video} autoPlay playsInline muted aria-label={t("camera_preview")} className="mt-4 w-full max-w-xl rounded-2xl bg-black" />
        )}
        {photos[angle] && camera !== "on" && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={photos[angle].url} alt={t("photo_of", { angle: t(`angle_${angle}` as Key) })} className="mt-4 w-full max-w-xl rounded-2xl" />
        )}
        {camera === "failed" && <p role="alert" className="mt-4 text-accent">{t("camera_failed")}</p>}

        <div className="mt-4 flex flex-wrap gap-3">
          {camera === "on"
            ? <>
              <button type="button" onClick={snap} className="rounded-lg bg-accent px-6 py-3 font-semibold text-on-accent">{t("take_photo")}</button>
              <button type="button" onClick={stopCamera} className="rounded-lg border border-line px-6 py-3 font-semibold">{t("stop_camera")}</button>
            </>
            : camera === "off" && typeof navigator !== "undefined" && "mediaDevices" in navigator && (
              <button type="button" onClick={startCamera} className="rounded-lg border border-line px-6 py-3 font-semibold">{t("use_camera")}</button>
            )}
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-line px-6 py-3 font-semibold focus-within:ring-2 focus-within:ring-accent">
            {t("choose_photo")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) keep(f); e.target.value = ""; }}
            />
          </label>
          {i < ANGLES.length - 1 && (
            <button type="button" onClick={() => setI(i + 1)} className="rounded-lg px-6 py-3 font-semibold text-muted">{t("skip_angle")}</button>
          )}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-4" aria-live="polite">
        <p className="text-muted">{t("photos_ready", { n: count, total: ANGLES.length })}</p>
        <button
          type="button"
          disabled={!count || phase === "busy"}
          onClick={submit}
          className="rounded-lg bg-accent px-8 py-3 font-semibold text-on-accent disabled:opacity-50"
        >
          {phase === "busy" ? t("analyzing") : t("get_estimate")}
        </button>
        {phase === "busy" && <p className="animate-pulse text-sm text-muted">{t("slow_inspection")}</p>}
        {phase === "error" && <p role="alert" className="text-accent">{t("error")}</p>}
        {phase === "ai_busy" && <p role="alert" className="text-accent">{t("ai_busy_photos")}</p>}
      </div>
    </Card>
  );
}
