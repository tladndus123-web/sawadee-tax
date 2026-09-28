"use client";

// Delivery-app commission for the month: per app the orders, the GP (with its 7% VAT) and the payout to expect.
// Admins set each app's rate here; everyone else sees the rates in use.

import { Bike, Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_CHANNELS, type AppChannel, feeRate, type MonthFees } from "@/lib/app-fees";
import { saveCompany, useCompany } from "@/lib/company-store";
import { baht } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { useChannelLabel } from "./channel-name";

export function AppFeesCard({ f }: { f: MonthFees }) {
  const t = useTranslations();
  const company = useCompany();
  const isAdmin = useMe().role === "admin";
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const chName = useChannelLabel();

  const startEdit = () => {
    setRates(Object.fromEntries(APP_CHANNELS.map((c) => [c, String(feeRate(company.appFees, c))])));
    setNames(Object.fromEntries(APP_CHANNELS.map((c) => [c, company.channelNames?.[c] ?? ""])));
    setEditing(true);
  };
  const save = async () => {
    const next: Partial<Record<AppChannel, number>> = {};
    for (const c of APP_CHANNELS) {
      const n = Number(rates[c]);
      if (!Number.isFinite(n) || n < 0 || n > 100) return toast.error(t("fees.bad"));
      next[c] = Math.round(n * 100) / 100;
    }
    setBusy(true);
    try {
      const channelNames = { ...company.channelNames, ...Object.fromEntries(APP_CHANNELS.map((c) => [c, (names[c] ?? "").trim().slice(0, 30)])) };
      await saveCompany({ app_fees: next, channel_names: Object.fromEntries(Object.entries(channelNames).filter(([, v]) => v)) });
      toast.success(t("fees.saved"));
      setEditing(false);
    } catch {
      toast.error(t("app.saveFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-panel grid gap-3 p-5 sm:p-6" aria-label={t("fees.title")}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Bike className="size-4 text-brand" aria-hidden />
          {t("fees.title")}
        </p>
        {isAdmin && !editing && (
          <Button type="button" variant="ghost" size="sm" className="h-8 rounded-full px-3" onClick={startEdit}>
            <Pencil className="size-3.5" />
            {t("fees.edit")}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {APP_CHANNELS.map((c) => (
              <label key={c} className="grid gap-1 rounded-2xl bg-muted/60 px-3 py-2">
                <Input
                  value={names[c] ?? ""}
                  placeholder={t(`sales.ch.${c}`)}
                  maxLength={30}
                  onChange={(e) => setNames({ ...names, [c]: e.target.value })}
                  className="h-8 bg-background text-xs font-medium"
                  aria-label={t("fees.name")}
                />
                <span className="flex items-center gap-1">
                  <Input
                    inputMode="decimal"
                    value={rates[c] ?? ""}
                    onChange={(e) => setRates({ ...rates, [c]: e.target.value.replace(/[^\d.]/g, "") })}
                    className="h-9 bg-background text-right tabular-nums"
                    aria-label={`${chName(c)} %`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={() => setEditing(false)}>
              {t("fees.cancel")}
            </Button>
            <Button type="button" className="rounded-full" disabled={busy} onClick={() => void save()}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("fees.save")}
            </Button>
          </div>
        </div>
      ) : f.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("fees.empty")}</p>
      ) : (
        <>
          <ul className="grid">
            {f.lines.map((l) => (
              <li key={l.channel} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-border/60 py-2.5 last:border-0">
                <span className="text-[15px] font-semibold">
                  {chName(l.channel)} <span className="text-xs font-normal text-muted-foreground">GP {l.rate}%</span>
                </span>
                <span className="text-right text-[15px] font-semibold tabular-nums">{baht(l.payout)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("fees.line", { gross: baht(l.gross), fee: baht(l.fee + l.feeVat) })}
                </span>
                <span className="text-right text-xs text-muted-foreground">{t("fees.payout")}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Sum label={t("fees.gross")} value={baht(f.gross)} />
            <Sum label={t("fees.fee")} value={`− ${baht(f.fee + f.feeVat)}`} tone="bad" />
            <Sum label={t("fees.payoutTotal")} value={baht(f.payout)} tone="brand" />
          </div>
        </>
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("fees.note")}</p>
    </section>
  );
}

function Sum({ label, value, tone }: { label: string; value: string; tone?: "bad" | "brand" }) {
  return (
    <div className="grid min-w-0 gap-0.5 rounded-2xl bg-muted/60 px-1.5 py-2.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[13px] font-semibold whitespace-nowrap tabular-nums sm:text-[15px] ${tone === "bad" ? "text-bad" : tone === "brand" ? "text-brand" : ""}`}>{value}</span>
    </div>
  );
}
