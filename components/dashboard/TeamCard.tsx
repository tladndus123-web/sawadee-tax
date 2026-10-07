"use client";

// Admins: what each member did in the chosen month — uploaded, edited, marked fine, deleted (lib/team-summary).

import { Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { monthRange, type TeamEvent, type TeamRow, teamSummary } from "@/lib/team-summary";

export function TeamCard({ month }: { month: string }) {
  const t = useTranslations("team");
  const locale = useLocale();
  const [rows, setRows] = useState<(TeamRow & { name: string })[] | null>(null);

  useEffect(() => {
    let alive = true;
    const { from, to } = monthRange(month);
    const sb = supabaseBrowser();
    void Promise.all([
      sb.from("document_events").select("user_id, document_id, action, at").gte("at", from).lt("at", to).limit(5000),
      sb.from("documents").select("ack_by, ack_at").gte("ack_at", from).lt("ack_at", to),
      sb.from("members").select("user_id, name, email"),
    ]).then(([ev, acks, members]) => {
      if (!alive) return;
      const events: TeamEvent[] = (ev.data ?? []).map((e) => ({ userId: e.user_id, documentId: e.document_id, action: e.action, at: e.at }));
      const names = new Map((members.data ?? []).map((m) => [m.user_id as string, (m.name as string) || (m.email as string)]));
      const list = teamSummary(events, (acks.data ?? []).map((a) => ({ ackBy: a.ack_by, ackAt: a.ack_at })), month);
      setRows(list.map((r) => ({ ...r, name: names.get(r.userId) ?? t("someone") })));
    });
    return () => {
      alive = false;
    };
  }, [month, t]);

  const when = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (rows && rows.length === 0) return null;

  return (
    <section aria-labelledby="team-title" className="workspace-panel hover-lift [--lift:1.006] grid gap-3 p-5 sm:p-6">
      <div>
        <h2 id="team-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Users className="size-5 text-muted-foreground" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      <ul className="grid">
        {(rows ?? []).map((r) => (
          <li key={r.userId} className="grid gap-2 border-b border-border/60 py-3 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[15px] font-semibold">{r.name}</span>
              {r.lastAt && <span className="flex-none text-xs text-muted-foreground tabular-nums">{t("last", { when: when.format(new Date(r.lastAt)) })}</span>}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label={t("created")} n={r.created} />
              <Stat label={t("edited")} n={r.edited} />
              <Stat label={t("acked")} n={r.acked} />
              <Stat label={t("deleted")} n={r.deleted + r.restored} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <div className="grid gap-0.5 rounded-xl bg-muted/60 px-1 py-2">
      <span className={n ? "text-lg leading-tight font-semibold tabular-nums" : "text-lg leading-tight font-semibold text-muted-foreground/50 tabular-nums"}>{n}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
