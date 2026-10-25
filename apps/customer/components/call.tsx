"use client";
import { useContext, useEffect, useRef, useState } from "react";
import type { Call as CallState, CallLine } from "@nextmove/contracts";
import { API_URL } from "@nextmove/contracts/client";
import { KioskContext } from "@/components/kiosk";
import { useI18n } from "@/lib/i18n";
import { recognitionCtor, type Recognition } from "@/lib/speech";
import { SPEAKER_RATE, floatTo16, player, ringback, rms, startMic } from "@/lib/voice";

// The live call needs the real API (a WebSocket MSW can't mock): off on the mock-mode public site.
const MOCKED = !process.env.NEXT_PUBLIC_API_MOCKING || process.env.NEXT_PUBLIC_API_MOCKING === "enabled";
const ECHO_GATE = 0.06;   // while the agent talks, only clearly louder speech (a barge-in) goes up, not its own echo

type Phase = "ringing" | "live" | "ended" | "failed" | "no_mic";

/** "Talk to someone": opens a live voice call. No customerId = a walk-in guest. */
export function TalkButton({ customerId, className = "" }: { customerId?: string; className?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`inline-flex min-h-16 items-center gap-3 rounded-full bg-accent px-8 font-semibold text-on-accent shadow-lg transition hover:brightness-110 ${className}`}>
        <span aria-hidden>📞</span> {t("talk_to_someone")}
      </button>
      {open && <CallScreen customerId={customerId} onClose={() => setOpen(false)} />}
    </>
  );
}

function CallScreen({ customerId, onClose }: { customerId?: string; onClose: () => void }) {
  const { t, lang, locale } = useI18n();
  const kiosk = useContext(KioskContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>("ringing");
  const [call, setCall] = useState<CallState>();
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const ws = useRef<WebSocket | null>(null);
  const status = call?.status ?? "ai";

  useEffect(() => {
    dialog.current?.showModal();
    if (MOCKED) return;
    const speaker = new AudioContext({ sampleRate: SPEAKER_RATE });
    let stopRing: (() => void) | undefined = ringback(speaker);
    const answered = () => { stopRing?.(); stopRing = undefined; setPhase((p) => (p === "ringing" ? "live" : p)); };
    const out = player(speaker);
    let stopMic: (() => void) | undefined;
    let callStatus = "ai";
    const sock = new WebSocket(`${API_URL.replace(/^http/, "ws")}/voice/${encodeURIComponent(customerId ?? "GUEST")}?lang=${lang}&surface=${kiosk ? "kiosk" : "app"}`);
    sock.binaryType = "arraybuffer";
    ws.current = sock;
    sock.onopen = () => {
      startMic((frame) => {
        if (sock.readyState !== WebSocket.OPEN || mutedRef.current || callStatus !== "ai") return;
        if (out.speaking && rms(frame) < ECHO_GATE) return;
        sock.send(floatTo16(frame).buffer);
      }).then((stop) => { stopMic = stop; }, () => setPhase("no_mic"));
    };
    sock.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
      if (e.data instanceof ArrayBuffer) { answered(); out.play(e.data); return; }
      const m = JSON.parse(e.data) as { type: string; call?: CallState; text?: string };
      if (m.type === "call" && m.call) {
        callStatus = m.call.status;
        setCall(m.call);
        if (m.call.lines.some((l) => l.role === "system")) answered();
      } else if (m.type === "interrupted") out.flush();
      else if (m.type === "say" && m.text && "speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(m.text);
        u.lang = locale;
        speechSynthesis.speak(u);
      }
    };
    sock.onerror = () => setPhase("failed");
    sock.onclose = () => { stopRing?.(); setPhase((p) => (p === "failed" || p === "no_mic" ? p : "ended")); };
    // A voice call has no taps: keep the kiosk's 60 s idle reset from hanging up on the caller.
    const keepAwake = setInterval(() => window.dispatchEvent(new Event("kiosk-activity")), 15_000);
    return () => {
      clearInterval(keepAwake);
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: "hangup" }));
      sock.close();
      ws.current = null;
      stopRing?.();
      stopMic?.();
      out.flush();
      void speaker.close();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    };
  }, [customerId, kiosk, lang, locale]);

  // After a rep takes over there's no AI to listen: the browser transcribes the caller for the rep to read.
  useEffect(() => {
    const Ctor = recognitionCtor();
    if (status !== "human" || !Ctor) return;
    let on = true;
    let r: Recognition;
    const listen = () => {
      r = new Ctor();
      r.lang = locale;
      r.continuous = true;
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        const res = e.results[e.resultIndex ?? e.results.length - 1];
        const text = res?.[0]?.transcript?.trim();
        if (text && !mutedRef.current) ws.current?.send(JSON.stringify({ type: "customer", text }));
      };
      r.onend = () => { if (on) listen(); };
      r.onerror = null;
      r.start();
    };
    listen();
    return () => { on = false; r.abort(); };
  }, [status, locale]);

  const toggleMute = () => { mutedRef.current = !mutedRef.current; setMuted(mutedRef.current); };
  const who = (l: CallLine) => l.role === "customer" ? t("call_you") : l.role === "agent" ? t("call_agent")
    : l.role === "employee" ? (call?.taken_by ?? t("a_specialist")) : "";
  const heading = MOCKED ? t("call_mocked") : phase === "ringing" ? t("call_ringing") : phase === "no_mic" ? t("call_no_mic")
    : phase === "failed" ? t("call_failed") : phase === "ended" ? t("call_ended")
    : status === "human" ? t("call_with_rep", { who: call?.taken_by ?? t("a_specialist") }) : t("call_with_agent");

  return (
    <dialog ref={dialog} onCancel={(e) => { e.preventDefault(); onClose(); }} aria-labelledby="call-title"
      className="m-0 h-full max-h-none w-full max-w-none bg-fg p-0 text-bg backdrop:bg-fg/60">
      <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
        <div className="flex items-center gap-4">
          <span aria-hidden className={`grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-3xl ${phase === "ringing" ? "animate-pulse" : ""}`}>
            {status === "human" ? "🧑‍💼" : "📞"}
          </span>
          <div>
            <h2 id="call-title" className="text-2xl font-semibold sm:text-3xl">{heading}</h2>
            <p className="text-sm opacity-70">{t("call_disclaimer")}</p>
          </div>
        </div>

        <ol aria-live="polite" className="mt-8 flex-1 space-y-4 overflow-y-auto">
          {call?.lines.map((l, i) => (
            <li key={i} className={l.role === "system" ? "text-center text-sm opacity-70" : l.role === "customer" ? "ml-auto max-w-[85%] text-right" : "max-w-[85%]"}>
              {who(l) && <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{who(l)}</p>}
              <p className={l.role === "system" ? "" : "text-xl leading-relaxed"}>{l.text}</p>
              {l.guardian && l.guardian.verdict !== "pass" && (
                <p className="mt-1 text-sm font-semibold text-accent">⚠ {t("call_flagged")}</p>
              )}
            </li>
          ))}
          {phase === "live" && !call?.lines.length && <li className="animate-pulse opacity-70">{t("call_connecting")}</li>}
        </ol>

        <div className="mt-6 flex flex-wrap justify-center gap-4">
          {!MOCKED && phase !== "ended" && phase !== "failed" && (
            <button type="button" onClick={toggleMute} aria-pressed={muted}
              className="min-h-16 rounded-full border border-bg/40 px-8 font-semibold">
              {muted ? t("call_unmute") : t("call_mute")}
            </button>
          )}
          <button type="button" onClick={onClose} className="min-h-16 rounded-full bg-accent px-10 font-semibold text-on-accent">
            {phase === "ended" || phase === "failed" || MOCKED ? t("close") : t("call_hang_up")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
