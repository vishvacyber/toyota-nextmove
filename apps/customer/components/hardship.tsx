"use client";
import { useState } from "react";
import type { Customer, Recommendation } from "@nextmove/contracts";
import { Card, ScenarioCard } from "@/components/cards";
import { Action, FollowUpAction, recordAction } from "@/components/decide-act";
import { useI18n } from "@/lib/i18n";
import type { HandoffChannel } from "@/lib/realtime";

/** Payment stress (Priya): options come from the recommendation's scenarios. Only the due-date change is the customer's to accept; deferral and extension are credit decisions (L4) for a TFS specialist. */
export function Hardship({ c, r, channel }: { c: Customer; r: Recommendation; channel: HandoffChannel }) {
  const { t } = useI18n();
  const [accepted, setAccepted] = useState(false);
  const options = [r.recommended, ...r.alternatives];
  const dueDate = options.find((s) => s.option === "due_date_change" && s.eligible);
  return (
    <Card title={t("hardship_title")}>
      <p className="text-2xl font-semibold">{t("hardship_detected")}</p>
      <p className="mt-1 text-muted">{t("hardship_body")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((s) => (
          <ScenarioCard key={s.option} s={s} recommended={s.option === r.recommended.option}>
            {s.option === "due_date_change"
              ? <p className="mt-4 text-sm font-medium">{t("hardship_yours")}</p>
              : <p className="mt-4 text-sm font-medium text-accent">{t("hardship_specialist")}</p>}
          </ScenarioCard>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {dueDate && (
          <Action
            title={t("accept_due_date")}
            body={dueDate.label}
            primary
            confirmText={t("confirm_due_date", { option: dueDate.label })}
            run={async () => {
              await recordAction(c.id, { type: "due_date_change", option: "due_date_change", detail: `Accepted: ${dueDate.label}` });
              setAccepted(true);
              return t("due_date_accepted", { option: dueDate.label });
            }}
          />
        )}
        <FollowUpAction
          customerId={c.id}
          channel={channel}
          title={t("request_callback")}
          body={t("request_callback_body")}
          primary={r.action.type === "request_callback"}
          reason={`Hardship callback: deferral/extension review (${accepted ? "due-date change accepted" : "due-date change not accepted"})`}
        />
      </div>
    </Card>
  );
}
