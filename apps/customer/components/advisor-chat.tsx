"use client";
import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useReducedMotion } from "framer-motion";
import type { AdvisorAnswer } from "@nextmove/contracts";
import { api, isBusy } from "@nextmove/contracts/client";
import { Card } from "@/components/cards";
import { KioskContext } from "@/components/kiosk";
import { useI18n } from "@/lib/i18n";
import { recognitionCtor, type Recognition } from "@/lib/speech";

type Turn = { q: string; a?: AdvisorAnswer; error?: "busy" | "failed" };

/** Step 5: Advisor chat. The API returns JSON (not a stream), so the answer is revealed client-side. Every number shown comes from `numbers_used`. */
export function AdvisorChat({ customerId }: { customerId: string }) {
  const { t, lang, locale } = useI18n();
  const surface = useContext(KioskContext) ? "kiosk" : "app";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [listening, setListening] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const [speaking, setSpeaking] = useState<string>();
  // Client-only: this step renders after the customer fetch, never on the server.
  const canListen = !!recognitionCtor();
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    // Unmount (sign-out, step change, kiosk idle reset) stops the mic and any speech.
    return () => {
      rec.current?.abort();
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    };
  }, []);

  function speak(answer: string) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(answer);
    u.lang = locale;
    u.onend = u.onerror = () => setSpeaking(undefined);
    setSpeaking(answer);
    speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    speechSynthesis.cancel();
    setSpeaking(undefined);
  }

  async function ask(message: string) {
    const q = message.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    setTurns((ts) => [...ts, { q }]);
    try {
      const a = await api<AdvisorAnswer>("/agents/advisor/ask", {
        method: "POST",
        body: JSON.stringify({ customer_id: customerId, message: q, language: lang, surface, session_id: sessionId }),
      });
      if (a.session_id) setSessionId(a.session_id);
      setTurns((ts) => ts.map((x, k) => (k === ts.length - 1 ? { ...x, a } : x)));
      if (speakOn && a.guardian.verdict !== "block") speak(a.answer);
    } catch (e) {
      const error = isBusy(e) ? "busy" : "failed";
      setTurns((ts) => ts.map((x, k) => (k === ts.length - 1 ? { ...x, error } : x)));
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (listening) { rec.current?.abort(); return; }
    const r = new Ctor();
    r.lang = locale;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => void ask(e.results[0]?.[0]?.transcript ?? "");
    r.onend = r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };
  const suggestions = [t("ask_suggest_1"), t("ask_suggest_2"), t("ask_suggest_3")];

  return (
    <Card title={t("ask_title")}>
      <p className="text-muted">{t("ask_body")}</p>
      <ol className="mt-4 space-y-6">
        {turns.map((turn, k) => (
          <li key={k} className="space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-fg px-4 py-3 text-bg">{turn.q}</p>
            {turn.error && (
              <p role="alert" className="text-accent">
                {t(turn.error === "busy" ? "ai_busy" : "error")}{" "}
                <button type="button" disabled={busy} className="font-semibold underline"
                  onClick={() => { setTurns((ts) => ts.filter((x) => x !== turn)); void ask(turn.q); }}>
                  {t("retry")}
                </button>
              </p>
            )}
            {!turn.a && !turn.error && <p role="status" className="animate-pulse text-muted">{t("thinking")} <span className="block text-sm">{t("slow_advisor")}</span></p>}
            {turn.a && <Answer a={turn.a} />}
          </li>
        ))}
      </ol>

      {!turns.length && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line px-4 py-2 text-left">{s}</button>
          ))}
        </div>
      )}

      {speaking && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl bg-fg px-4 py-3 text-bg">
          <p className="flex-1"><span className="font-semibold">{t("caption")}: </span><>{speaking}</></p>
          <button type="button" onClick={stopSpeaking} className="rounded-full border border-bg/40 px-4 py-1 font-semibold">{t("stop")}</button>
        </div>
      )}

      <form onSubmit={submit} className="mt-6 flex flex-wrap gap-3">
        <label htmlFor="ask-input" className="sr-only">{t("ask_label")}</label>
        <input
          id="ask-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("ask_placeholder")}
          className="min-w-0 flex-1 rounded-full border border-line bg-bg px-5 py-3"
        />
        {canListen && (
          <button
            type="button"
            onClick={listen}
            aria-pressed={listening}
            aria-label={listening ? t("mic_stop") : t("mic_start")}
            className={`rounded-full px-5 py-3 font-semibold ${listening ? "animate-pulse bg-accent text-on-accent" : "border border-line"}`}
          >
            🎤 {listening ? t("listening") : t("speak")}
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()} className="rounded-full bg-accent px-6 py-3 font-semibold text-on-accent disabled:opacity-50">
          {t("send")}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={speakOn} onChange={(e) => { setSpeakOn(e.target.checked); if (!e.target.checked) stopSpeaking(); }} className="h-5 w-5 accent-accent" />
          {t("read_aloud")}
        </label>
        {!canListen && <span>{t("voice_unsupported")}</span>}
      </div>
    </Card>
  );
}

function Answer({ a }: { a: AdvisorAnswer }) {
  const { t, num } = useI18n();
  const reduce = useReducedMotion();
  const words = a.answer.split(/(\s+)/);
  const [shown, setShown] = useState(reduce ? words.length : 0);
  useEffect(() => {
    if (shown >= words.length) return;
    const id = setTimeout(() => setShown((n) => n + 2), 30);
    return () => clearTimeout(id);
  }, [shown, words.length]);

  // Guardian rule: a blocked answer never reaches the customer.
  if (a.guardian.verdict === "block") return <p role="status" className="text-lg">{t("under_review")}</p>;
  const failed = a.guardian.checks.filter((c) => !c.passed).map((c) => c.name.replace(/_/g, " "));
  return (
    <div className="max-w-[85%] rounded-2xl border border-line bg-bg px-4 py-3">
      {/* Visible text is revealed word by word; screen readers get the full answer once. */}
      <p aria-hidden className="text-lg leading-relaxed"><>{words.slice(0, shown).join("")}</></p>
      <p aria-live="polite" className="sr-only">{a.answer}</p>
      {a.numbers_used.length > 0 && (
        <div className="mt-3 border-t border-line pt-3 text-sm">
          <p className="font-semibold text-muted">{t("numbers_used")}</p>
          <ul className="mt-1 space-y-1">
            {a.numbers_used.map((n) => (
              <li key={`${n.label}-${n.value}-${n.source_tool}`} className="flex flex-wrap justify-between gap-x-4">
                <span>{n.label}</span>
                <span className="tabular-nums"><span className="font-semibold"><>{num(n.value)}</></span> <span className="text-muted">· {n.source_tool}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-sm text-muted">
        {a.guardian.verdict === "pass" ? t("guardian_pass") : t("guardian_revise", { checks: failed.join(", ") })}
      </p>
    </div>
  );
}
