"use client";

// Fixed costs without an invoice (rent, internet, insurance …): a name, a category, the amount a month and the months
// it runs. Everyone sees the list (the amounts are in the cost figures); admins add, end, or change an amount from a
// month on (the old amount stays on the months before — a closed month never changes).

import { CalendarClock, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { useBranchName } from "@/components/layout/branch-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CategoryIcon, useCategoryLabel, useCategoryOptions } from "@/components/vendors/CategoryIcon";
import { monthDate } from "@/lib/archive";
import { branchLabel, byId, headOf } from "@/lib/branches";
import { useBranches } from "@/lib/branch-store";
import { type FixedLine, fixedActive } from "@/lib/fixed-costs";
import { changeAmount, deleteFixed, saveFixed, useFixedCosts } from "@/lib/fixed-store";
import { baht, bahtWhole } from "@/lib/money";
import { isMonthLocked } from "@/lib/month-lock-store";
import { useMe } from "@/lib/role-store";
import { todayBangkok } from "@/lib/thai-tax";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFoldStatus } from "./SettingsFold";

type Draft = Omit<FixedLine, "id"> & { id?: string };

export function FixedCostCard() {
  const t = useTranslations("fixed");
  const locale = useLocale();
  const isAdmin = useMe().role === "admin";
  const names = useBranchName();
  const { branches } = useBranches();
  const catLabel = useCategoryLabel();
  const { lines, loaded } = useFixedCosts({ all: true });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [amountOf, setAmountOf] = useState<FixedLine | null>(null);
  const [busy, setBusy] = useState(false);
  const thisMonth = todayBangkok().slice(0, 7);
  const ym = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", timeZone: "UTC" });
  const monthText = (m: string) => ym.format(monthDate(m));
  // Running lines first, then the ended ones
  const sorted = [...lines].sort((a, b) => Number(fixedActive(b, thisMonth)) - Number(fixedActive(a, thisMonth)) || a.name.localeCompare(b.name));
  const monthly = lines.filter((l) => fixedActive(l, thisMonth)).reduce((a, l) => a + l.amount, 0);
  const tf = useTranslations("fold");
  useFoldStatus(loaded ? (monthly ? tf("fixed", { amount: bahtWhole(monthly) }) : tf("none")) : null);

  const remove = async (l: FixedLine) => {
    if (!confirm(t("deleteAsk", { name: l.name }))) return;
    setBusy(true);
    try {
      await deleteFixed(l.id);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("lockedEnd") : t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="fixed-title" className="workspace-panel hover-lift [--lift:1.006] grid content-start gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="fixed-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <CalendarClock className="size-5 text-brand" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      {!loaded ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid divide-y divide-border/60">
          {sorted.map((l) => {
            const running = fixedActive(l, thisMonth);
            const b = byId(branches, l.branchId);
            return (
              <li key={l.id} className={cn("flex items-center gap-2 py-2.5 sm:gap-3", !running && "opacity-55")}>
                <CategoryIcon category={l.category} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-[15px] font-medium">{l.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[catLabel(l.category), b && branches.length > 1 ? branchLabel(b, names) : "", l.toMonth ? t("range", { from: monthText(l.fromMonth), to: monthText(l.toMonth) }) : t("since", { from: monthText(l.fromMonth) })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="grid flex-none text-right">
                  <span className="text-[15px] font-semibold tabular-nums">{baht(l.amount)}</span>
                  <span className="text-[11px] text-muted-foreground max-sm:hidden">{t("perMonth")}</span>
                </span>
                {isAdmin && (
                  <span className="flex flex-none">
                    <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("edit")} disabled={busy} onClick={() => setDraft({ ...l })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-bad" aria-label={t("delete")} disabled={busy} onClick={() => void remove(l)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {lines.length > 0 && <p className="text-xs text-muted-foreground tabular-nums">{t("monthly", { amount: baht(monthly) })}</p>}
      {isAdmin && !draft && !amountOf && (
        <Button
          type="button"
          variant="secondary"
          className="h-10 w-fit rounded-full px-4"
          onClick={() => setDraft({ branchId: headOf(branches)?.id ?? "", category: "rent", name: "", amount: 0, fromMonth: thisMonth, toMonth: null, note: "" })}
        >
          <Plus className="size-4" />
          {t("add")}
        </Button>
      )}
      {draft && <FixedForm draft={draft} onChange={setDraft} onDone={() => setDraft(null)} onAmount={(l) => (setDraft(null), setAmountOf(l))} />}
      {amountOf && <AmountForm line={amountOf} onDone={() => setAmountOf(null)} />}
    </section>
  );
}

function MonthInput({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  return <Input type="month" value={value} min={min} onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && onChange(e.target.value)} className="h-10 bg-background tabular-nums" />;
}

function FixedForm({ draft, onChange, onDone, onAmount }: { draft: Draft; onChange: (d: Draft) => void; onDone: () => void; onAmount: (l: FixedLine) => void }) {
  const t = useTranslations("fixed");
  const names = useBranchName();
  const { branches } = useBranches();
  const options = useCategoryOptions(draft.category);
  const [busy, setBusy] = useState(false);
  const [ends, setEnds] = useState(!!draft.toMonth);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });

  const save = async () => {
    if (!draft.name.trim()) return toast.error(t("needName"));
    if (!draft.id && draft.amount <= 0) return toast.error(t("needAmount"));
    setBusy(true);
    try {
      await saveFixed({ ...draft, toMonth: ends ? draft.toMonth || draft.fromMonth : null });
      toast.success(t("saved"));
      onDone();
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-3 rounded-2xl bg-muted/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{t("name")}</span>
          <Input value={draft.name} maxLength={60} placeholder={t("namePlaceholder")} onChange={(e) => set("name", e.target.value)} className="h-10 bg-background" autoFocus={!draft.id} />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{t("category")}</span>
          <select value={draft.category} onChange={(e) => set("category", e.target.value as Category)} className="h-10 rounded-xl border bg-background px-3 text-sm">
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {draft.id ? (
          <div className="grid gap-1">
            <span className="text-[11px] text-muted-foreground">{t("amount")}</span>
            <div className="flex h-10 items-center justify-between gap-2 rounded-xl border bg-background/60 px-3 text-sm">
              <span className="font-semibold tabular-nums">{baht(draft.amount)}</span>
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => onAmount(draft as FixedLine)}>
                {t("changeAmount")}
              </button>
            </div>
          </div>
        ) : (
          <label className="grid gap-1">
            <span className="text-[11px] text-muted-foreground">{t("amount")}</span>
            <MoneyInput className="h-10 bg-background text-[15px] font-semibold" value={draft.amount} onChange={(v) => set("amount", Number(v) || 0)} />
          </label>
        )}
        {branches.length > 1 && (
          <label className="grid gap-1">
            <span className="text-[11px] text-muted-foreground">{t("branch")}</span>
            <select value={draft.branchId} disabled={!!draft.id} onChange={(e) => set("branchId", e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {branchLabel(b, names)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{t("from")}</span>
          {draft.id ? <span className="flex h-10 items-center text-sm tabular-nums">{draft.fromMonth}</span> : <MonthInput value={draft.fromMonth} onChange={(v) => set("fromMonth", v)} />}
        </label>
        <div className="grid gap-1">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={ends} onChange={(e) => setEnds(e.target.checked)} className="size-4 accent-primary" />
            {t("ends")}
          </label>
          {ends && <MonthInput value={draft.toMonth ?? draft.fromMonth} min={draft.fromMonth} onChange={(v) => set("toMonth", v)} />}
        </div>
      </div>
      <label className="grid gap-1">
        <span className="text-[11px] text-muted-foreground">{t("note")}</span>
        <Input value={draft.note} maxLength={200} onChange={(e) => set("note", e.target.value)} className="h-10 bg-background" />
      </label>
      <p className="text-[11px] leading-snug text-muted-foreground">{t("formHint")}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" className="rounded-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

/** A new amount from a month on; the months before keep the old one */
function AmountForm({ line, onDone }: { line: FixedLine; onDone: () => void }) {
  const t = useTranslations("fixed");
  const [amount, setAmount] = useState(line.amount);
  const [from, setFrom] = useState(todayBangkok().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (amount <= 0) return toast.error(t("needAmount"));
    setBusy(true);
    try {
      await changeAmount(line, amount, from);
      toast.success(t("saved"));
      onDone();
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="grid gap-3 rounded-2xl bg-muted/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm font-semibold">{t("changeTitle", { name: line.name })}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{t("newAmount")}</span>
          <MoneyInput className="h-10 bg-background text-[15px] font-semibold" value={amount} onChange={(v) => setAmount(Number(v) || 0)} autoFocus />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{t("applyFrom")}</span>
          <MonthInput value={from} onChange={setFrom} />
        </label>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{t("changeHint", { amount: baht(line.amount) })}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" className="rounded-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
