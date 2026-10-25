"use client";
import { useContext, useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { components, Customer, DealPacket, Handoff, Offer, Recommendation, ScenarioRequest, ScenarioSet, TimingPlan } from "@nextmove/contracts";
import { api, useApi } from "@nextmove/contracts/client";
import { Card, ScenarioCard } from "@/components/cards";
import { Private, PrivacyContext } from "@/components/private";
import { useI18n, type Key } from "@/lib/i18n";
import type { HandoffChannel } from "@/lib/realtime";
import { Hardship } from "@/components/hardship";
import { Inspection } from "@/components/inspection";

type Overrides = NonNullable<ScenarioRequest["overrides"]>;
type ActionType = Recommendation["action"]["type"];

/** Step 4: what-if, timing, true cost, and L3 actions. Every number is shown as the API returns it. */
export function DecideAct({ c, r, channel }: { c: Customer; r: Recommendation; channel: HandoffChannel }) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [set, setSet] = useState<ScenarioSet>();
  const [error, setError] = useState(false);
  const { t } = useI18n();

  const body = JSON.stringify({ customer_id: c.id, overrides } satisfies ScenarioRequest);
  useEffect(() => {
    let live = true;
    // Debounced so dragging a slider sends one request, not dozens.
    const timer = setTimeout(() => {
      api<ScenarioSet>("/scenarios", { method: "POST", body }).then(
        (s) => { if (live) { setSet(s); setError(false); } },
        () => live && setError(true),
      );
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [body]);

  if (r.guardian.verdict === "block") return <p role="status" className="text-xl">{t("under_review")}</p>;
  return (
    <div className="grid gap-6">
      {r.situation === "payment_stress" && <Hardship c={c} r={r} channel={channel} />}
      {c.contract.type === "lease" && <Inspection customerId={c.id} />}
      <WhatIf c={c} r={r} overrides={overrides} onChange={setOverrides} set={set} error={error} />
      <Timing id={c.id} />
      {set && <TrueCost set={set} />}
      <ActionCenter c={c} r={r} channel={channel} />
    </div>
  );
}

function asOf(at: string, locale: string) {
  return new Date(at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

function WhatIf({ c, r, overrides, onChange, set, error }: {
  c: Customer; r: Recommendation; overrides: Overrides; onChange: (o: Overrides) => void; set?: ScenarioSet; error: boolean;
}) {
  const { t, money, num, locale } = useI18n();
  // Slider positions are inputs the customer picks; the engine computes what they cost.
  const sliders = [
    { key: "down_payment", label: t("down_payment"), min: 0, max: 10000, step: 500, value: overrides.down_payment ?? 0, show: (v: number) => <Private>{money(v)}</Private> },
    { key: "term_months", label: t("term"), min: 24, max: 72, step: 12, value: overrides.term_months ?? 60, show: (v: number) => t("months_n", { n: v }) },
    { key: "annual_miles", label: t("annual_miles"), min: 6000, max: 24000, step: 1000, value: overrides.annual_miles ?? c.contract.annual_mile_allowance ?? 12000, show: (v: number) => t("miles_per_year", { miles: num(v) }) },
  ] as const;
  const shown = set?.scenarios.filter((s) => s.eligible && s.option !== "do_nothing") ?? [];
  return (
    <Card title={t("what_if")}>
      <p className="text-muted">{t("what_if_body")}</p>
      <div className="mt-4 grid gap-6 md:grid-cols-3">
        {sliders.map((s) => (
          <label key={s.key} className="block">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{s.label}</span>
              <span className="font-semibold tabular-nums">{s.show(s.value)}</span>
            </span>
            <input
              type="range" min={s.min} max={s.max} step={s.step} value={s.value}
              onChange={(e) => onChange({ ...overrides, [s.key]: Number(e.target.value) })}
              className="mt-2 w-full accent-accent"
            />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 text-accent">{t("error")}</p>}
      <div aria-live="polite" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((s) => <ScenarioCard key={s.option} s={s} recommended={s.option === r.recommended.option} />)}
      </div>
      {set && (
        <p className="mt-4 text-sm text-muted">
          <Private>{set.assumptions.join(" · ")}</Private> · {t("calculated_at", { at: asOf(set.as_of, locale) })}
        </p>
      )}
    </Card>
  );
}

function Timing({ id }: { id: string }) {
  const { t, money, locale } = useI18n();
  const { data: plan, error } = useApi<TimingPlan>(`/customers/${encodeURIComponent(id)}/timing`);
  if (error) return null;
  if (!plan) return <p className="text-muted">{t("loading")}</p>;
  const month = (d: string) => new Date(d).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  const data = plan.months.map((m) => ({ ...m, label: m.month_offset === 0 ? t("now") : month(m.date) }));
  const best = plan.months.find((m) => m.month_offset === plan.best_month_offset);
  return (
    <Card title={t("best_time")}>
      {best && <p className="text-2xl font-semibold">{plan.best_month_offset === 0 ? t("best_now") : t("best_in", { months: plan.best_month_offset })}</p>}
      <p className="mt-1 text-muted"><Private>{plan.summary}</Private></p>
      <div className="mt-4">
        <Private className="block w-full">
          <div role="img" aria-label={t("timing_chart_label")} className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--nm-text-muted)" />
                <YAxis tickFormatter={(v: number) => money(v)} tickLine={false} axisLine={false} width={72} stroke="var(--nm-text-muted)" />
                <Tooltip formatter={(v) => [money(Number(v)), t("net_position")]} cursor={{ fill: "var(--nm-surface)" }} />
                <Bar dataKey="net_position" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                  {data.map((m) => <Cell key={m.month_offset} fill={m.month_offset === plan.best_month_offset ? "var(--nm-red)" : "var(--nm-border)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Private>
        <ul className="sr-only">
          {data.map((m) => <li key={m.month_offset}>{m.label}: {money(m.net_position)}</li>)}
        </ul>
      </div>
      <p className="mt-4">
        {t("act_now_vs_wait")} <span className="font-semibold tabular-nums"><Private>{money(plan.act_now_vs_wait_3)}</Private></span>
      </p>
      <p className="mt-2 text-sm text-muted">{t("net_position_hint")} · {t("calculated_at", { at: asOf(plan.as_of, locale) })}</p>
    </Card>
  );
}

const COST_ROWS = ["payment", "fuel", "maintenance", "insurance", "total_monthly"] as const;

function TrueCost({ set }: { set: ScenarioSet }) {
  const { t, money, num, locale } = useI18n();
  const withCost = set.scenarios.filter((s) => s.true_cost && s.option !== "do_nothing");
  if (!withCost.length) return null;
  return (
    <Card title={t("true_cost")}>
      <p className="text-muted">{t("true_cost_body")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {withCost.map((s) => {
          const tc = s.true_cost!;
          return (
            <section key={s.option} aria-label={s.label} className="rounded-2xl border border-line p-5">
              <h3 className="text-lg font-semibold">{s.label}</h3>
              <Private className="mt-3 block w-full">
                {COST_ROWS.map((k) => (
                  <span key={k} className={`flex justify-between gap-4 border-t border-line py-2 first:border-t-0 ${k === "total_monthly" ? "font-semibold" : ""}`}>
                    <span className={k === "total_monthly" ? "" : "text-muted"}>{t(`tc_${k}` as Key)}</span>
                    <span className="tabular-nums">{money(tc[k])}</span>
                  </span>
                ))}
              </Private>
              <p className="mt-3 flex justify-between gap-4 rounded-xl bg-surface px-3 py-2">
                <span>{t("co2")}</span>
                <span className="font-semibold tabular-nums">{t("kg_per_year", { kg: num(tc.co2_kg_per_year) })}</span>
              </p>
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-muted">{t("insurance_estimate")} · {t("calculated_at", { at: asOf(set.as_of, locale) })}</p>
    </Card>
  );
}

// ---------- actions (L3: each needs the customer's tap and a confirmation) ----------

export function Action({ title, body, primary, confirmText, run, children }: {
  title: string; body?: ReactNode; primary?: boolean; confirmText: string; run: () => Promise<ReactNode>; children?: ReactNode;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"idle" | "confirm" | "busy" | "done" | "error">("idle");
  const [result, setResult] = useState<ReactNode>();
  async function confirm() {
    setPhase("busy");
    try {
      setResult(await run());
      setPhase("done");
    } catch {
      setPhase("error");
    }
  }
  return (
    <article className={`flex flex-col rounded-2xl p-5 ${primary ? "border-2 border-accent bg-bg" : "border border-line"}`}>
      {primary && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{t("recommended")}</p>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <div className="mt-1 text-muted">{body}</div>}
      <div className="mt-auto pt-4" aria-live="polite">
        {phase === "idle" && (
          <button type="button" onClick={() => setPhase("confirm")} className={`w-full rounded-full px-6 py-3 font-semibold ${primary ? "bg-accent text-on-accent hover:brightness-110" : "border border-line"}`}>
            {title}
          </button>
        )}
        {(phase === "confirm" || phase === "busy" || phase === "error") && (
          <div role="group" aria-label={t("confirm_title")} className="rounded-xl bg-surface p-4">
            {children}
            <p className="font-medium">{confirmText}</p>
            {phase === "error" && <p role="alert" className="mt-2 text-accent">{t("error")}</p>}
            <div className="mt-3 flex gap-3">
              <button type="button" disabled={phase === "busy"} onClick={confirm} className="flex-1 rounded-full bg-accent px-6 py-3 font-semibold text-on-accent disabled:opacity-60">
                {phase === "busy" ? t("sending") : t("confirm")}
              </button>
              <button type="button" disabled={phase === "busy"} onClick={() => setPhase("idle")} className="flex-1 rounded-full border border-line px-6 py-3 font-semibold">
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
        {phase === "done" && <div role="status" className="rounded-xl bg-surface p-4 font-semibold">✓ {result}</div>}
      </div>
    </article>
  );
}

/** Next three weekdays at 10:00 local: slot times only, no money. */
function followUpSlots(from = new Date()) {
  const slots: Date[] = [];
  const d = new Date(from);
  while (slots.length < 3) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) slots.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10));
  }
  return slots;
}

/** POST a handoff and broadcast `created` so the console queue sees it (K2). */
export async function requestHandoff(channel: HandoffChannel, body: components["schemas"]["HandoffCreate"]) {
  const h = await api<Handoff>("/handoffs", { method: "POST", body: JSON.stringify(body) });
  channel.announce(h);
  return h;
}

/** Callback at a picked slot: a handoff with `callback_at`. */
export function FollowUpAction({ customerId, channel, title, body, primary, reason }: {
  customerId: string; channel: HandoffChannel; title: string; body: string; primary?: boolean; reason: string;
}) {
  const { t, locale } = useI18n();
  const surface = useContext(PrivacyContext) ? "kiosk" : "app";
  const [slots] = useState(() => followUpSlots());
  const [slot, setSlot] = useState(0);
  const when = (d: Date) => d.toLocaleString(locale, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Action
      title={title}
      body={body}
      primary={primary}
      confirmText={t("confirm_book", { when: when(slots[slot]) })}
      run={async () => {
        await requestHandoff(channel, { customer_id: customerId, reason, surface, callback_at: slots[slot].toISOString() });
        return t("booked", { when: when(slots[slot]) });
      }}
    >
      <fieldset className="mb-3">
        <legend className="text-sm text-muted">{t("pick_time")}</legend>
        <div className="mt-2 grid gap-2">
          {slots.map((d, i) => (
            <label key={d.toISOString()} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2">
              <input type="radio" name={`slot-${title}`} checked={slot === i} onChange={() => setSlot(i)} className="accent-accent" />
              {when(d)}
            </label>
          ))}
        </div>
      </fieldset>
    </Action>
  );
}

function ActionCenter({ c, r, channel }: { c: Customer; r: Recommendation; channel: HandoffChannel }) {
  const { t, money } = useI18n();
  const surface = useContext(PrivacyContext) ? "kiosk" : "app";
  const offers = useApi<Offer[]>("/offers");
  const primary = (type: ActionType) => r.action.type === type;
  const matching = offers.data?.filter((o) => o.status === "active" && o.target_situation === r.situation) ?? [];
  const incentive = (o: Offer) =>
    o.incentive.type === "rate_reduction" ? t("offer_rate", { pct: o.incentive.value })
      : o.incentive.type === "fee_waiver" ? t("offer_fee_waiver")
        : <Private>{money(o.incentive.value)}</Private>;

  const handoff = (reason: string) => requestHandoff(channel, { customer_id: c.id, reason, surface });

  return (
    <Card title={t("action_center")}>
      <p className="text-muted">{t("action_center_body")}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Action
          title={t("act_send_packet")}
          body={t("act_send_packet_body", { option: r.recommended.label })}
          primary={primary("send_deal_packet")}
          confirmText={t("confirm_send_packet")}
          run={async () => {
            const p = await api<DealPacket>("/deal-packets", {
              method: "POST",
              body: JSON.stringify({ customer_id: c.id, option: r.recommended.option, target_model: r.recommended.target_vehicle?.model }),
            });
            return <>{t("packet_sent", { dealer: p.dealer.name })} <span className="block text-sm font-normal text-muted">{t("reference", { id: p.id })}</span></>;
          }}
        />
        <FollowUpAction
          customerId={c.id}
          channel={channel}
          title={t("act_book")}
          body={t("act_book_body")}
          primary={primary("book_appointment") || primary("request_callback")}
          reason={`Follow-up booked: ${r.recommended.label}`}
        />
        <Action
          title={t("act_self_service")}
          body={t("act_self_service_body", { option: r.recommended.label })}
          primary={primary("start_self_service")}
          confirmText={t("confirm_self_service")}
          run={async () => t("self_service_started")}
        />
        {matching.length
          ? matching.map((o) => (
            <Action
              key={o.id}
              title={t("act_claim")}
              body={<><Private>{o.name}</Private> · {incentive(o)}</>}
              primary={primary("claim_offer")}
              confirmText={t("confirm_claim")}
              run={async () => t("offer_claimed")}
            />
          ))
          : (
            <article className="rounded-2xl border border-dashed border-line p-5">
              <h3 className="text-lg font-semibold">{t("act_claim")}</h3>
              <p className="mt-1 text-muted">{offers.loading ? t("loading") : t("no_offers")}</p>
            </article>
          )}
      </div>
      <div className="mt-6">
        <Action
          title={t("talk_to_person")}
          body={t("talk_to_person_body")}
          primary={primary("start_hardship")}
          confirmText={t("confirm_talk")}
          run={async () => {
            await handoff(`Customer asked to talk to a person about: ${r.recommended.label}`);
            return t("talk_requested");
          }}
        />
      </div>
    </Card>
  );
}

/** Live status for "talk to a person", shown on every step once requested. */
export function HandoffBanner({ channel }: { channel: HandoffChannel }) {
  const { t } = useI18n();
  const talks = Object.values(channel.handoffs).filter((h) => !h.callback_at);
  const h = talks.at(-1);
  if (!h) return null;
  const text = h.status === "claimed"
    ? t("handoff_claimed", { who: h.claimed_by ?? t("a_specialist") })
    : h.status === "resolved" ? t("handoff_resolved") : t("handoff_waiting");
  return (
    <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-3">
      <span aria-hidden className={`h-3 w-3 rounded-full ${h.status === "waiting" ? "animate-pulse bg-accent" : h.status === "claimed" ? "bg-green-600" : "bg-muted"}`} />
      <span className="font-semibold">{text}</span>
      <span className="text-sm text-muted">
        {channel.live === false ? t("live_offline") : channel.live ? t("live_on") : t("live_connecting")}
      </span>
    </div>
  );
}
