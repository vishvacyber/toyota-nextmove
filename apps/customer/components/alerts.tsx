"use client";
import { useState } from "react";
import type { Alert } from "@nextmove/contracts";
import { api, useApi } from "@nextmove/contracts/client";
import { Card } from "@/components/cards";
import { Private } from "@/components/private";
import { useI18n } from "@/lib/i18n";

/** Proactive alerts (L3). Only alerts an employee approved or sent reach the customer; consent is the customer's own choice. */
export function Alerts({ customerId }: { customerId: string }) {
  const { t } = useI18n();
  const res = useApi<Alert[]>(`/alerts?customer_id=${encodeURIComponent(customerId)}`);
  // PATCH responses, by id, layered over the fetched list.
  const [patched, setPatched] = useState<Record<string, Alert>>({});
  const [failed, setFailed] = useState<string>();

  async function patch(a: Alert, body: { consent?: boolean; status?: "dismissed" }) {
    setFailed(undefined);
    try {
      const next = await api<Alert>(`/alerts/${encodeURIComponent(a.id)}`, { method: "PATCH", body: JSON.stringify({ ...body, actor: customerId }) });
      setPatched((p) => ({ ...p, [next.id]: next }));
    } catch {
      setFailed(a.id);
    }
  }

  if (res.error) return null;
  const shown = (res.data ?? []).map((a) => patched[a.id] ?? a).filter((a) => a.status === "sent" || a.status === "approved");
  return (
    <Card title={t("alerts_title")} className="md:col-span-2">
      {res.loading && <p className="text-muted">{t("loading")}</p>}
      {!res.loading && !shown.length && <p className="text-muted">{t("alerts_empty")}</p>}
      <ul className="space-y-4">
        {shown.map((a) => (
          <li key={a.id} className="rounded-2xl border border-line bg-bg p-5">
            <p className="text-lg font-semibold">{a.title}</p>
            <p className="mt-1 text-muted"><Private>{a.body}</Private></p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!a.consent}
                  onChange={(e) => patch(a, { consent: e.target.checked })}
                  className="h-5 w-5 accent-accent"
                />
                <span>{t("alert_consent")}</span>
              </label>
              <button type="button" onClick={() => patch(a, { status: "dismissed" })} className="rounded-full border border-line px-5 py-2 font-semibold">
                {t("dismiss")}
              </button>
            </div>
            {failed === a.id && <p role="alert" className="mt-2 text-accent">{t("error")}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
