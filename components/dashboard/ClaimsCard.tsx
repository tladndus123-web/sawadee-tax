"use client";

// Staff expense claims at a glance on the dashboard (owner, 2026-10-27): waiting for approval and money owed back,
// one tap to the expenses page. Admins; hidden while there is nothing to do.

import { ChevronRight, HandCoins } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useClaims } from "@/lib/expense-store";
import { claimSummary } from "@/lib/expenses";
import { bahtWhole, fromSatang } from "@/lib/money";
import { cn } from "@/lib/utils";

export function ClaimsCard({ today }: { today: string }) {
  const t = useTranslations("dash.claims");
  const { claims, loaded } = useClaims();
  if (!loaded) return null;
  const s = claimSummary(claims, today.slice(0, 7));
  const cell = (label: string, value: string, tone?: string) => (
    <span className="grid gap-0.5 rounded-2xl bg-muted/60 px-3.5 py-2.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-semibold tracking-tight tabular-nums", tone)}>{value}</span>
    </span>
  );
  return (
    <Link href="/expenses" className="workspace-panel press grid gap-3 p-5 sm:p-6" aria-label={t("title")}>
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <HandCoins className="size-5 text-brand" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">{t("title")}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <span className="grid grid-cols-3 gap-2">
        {cell(t("pending"), t("count", { n: s.pending }), s.pending ? "text-warn" : undefined)}
        {cell(t("owed"), bahtWhole(fromSatang(s.owed)), s.owed ? "text-brand" : undefined)}
        {cell(t("paid"), bahtWhole(fromSatang(s.paid)))}
      </span>
    </Link>
  );
}
