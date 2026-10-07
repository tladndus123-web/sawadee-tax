"use client";

// The shop's cash box (owner, 2026-10-08): what should be in it now, money put in / spent / counted, and spending
// without a receipt (counted as a cost of its month, no VAT back). lib/petty-cash has the arithmetic,
// lib/cash-store the data. Everyone of the branch records; admins delete; a closed month keeps its lines.

import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Coins, Loader2, ReceiptText, Scale, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { useBranchName } from "@/components/layout/branch-switcher";
import { useMonthLabel } from "@/components/ledger/Stickers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CategoryIcon, useCategoryOptions } from "@/components/vendors/CategoryIcon";
import { Link } from "@/i18n/navigation";
import { ALL, branchLabel, headOf } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { type CashDraft, deleteCash, saveCash, useCashMoves } from "@/lib/cash-store";
import { baht, fromSatang } from "@/lib/money";
import { isMonthLocked } from "@/lib/month-lock-store";
import { type CashKind, type CashRow, cashBook, cashMonth } from "@/lib/petty-cash";
import { useMe } from "@/lib/role-store";
import { todayBangkok } from "@/lib/thai-tax";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CashBox() {
  const t = useTranslations("cash");
  const locale = useLocale();
  const monthLabel = useMonthLabel();
  const names = useBranchName();
  const { branches } = useBranches();
  const branch = useBranch();
  const { moves, loaded } = useCashMoves();
  const isAdmin = useMe().role === "admin";
  const today = todayBangkok();
  const month = today.slice(0, 7);
  const [draft, setDraft] = useState<CashDraft | null>(null);

  // One running balance per branch (each box is its own); together = their sum
  const books = useMemo(() => {
    const ids = [...new Set(moves.map((m) => m.branchId))];
    return ids.map((id) => ({ id, ...cashBook(moves.filter((m) => m.branchId === id)) }));
  }, [moves]);
  const rows = useMemo(() => books.flatMap((b) => b.rows).sort((a, b) => b.move.day.localeCompare(a.move.day) || b.move.createdAt.localeCompare(a.move.createdAt)), [books]);
  const balance = books.reduce((a, b) => a + b.balance, 0);
  const lastCount = rows.find((r) => r.move.kind === "count");
  const sum = useMemo(() => cashMonth(moves, month), [moves, month]);
  const several = branch === ALL && branches.length > 1;
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" });
  const dayOf = (d: string) => day.format(new Date(`${d}T00:00:00Z`));

  const start = (kind: CashKind) =>
    setDraft({ kind, day: today, amount: 0, category: kind === "out" ? "food" : null, receipt: false, memo: "", branchId: branch !== ALL ? branch : (headOf(branches)?.id ?? "") });

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <Button asChild variant="ghost" className="-ml-3 w-fit text-primary">
        <Link href="/ledger">
          <ChevronLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>
      <header className="grid gap-1">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
      </header>

      {/* What should be in the box now */}
      <section className="workspace-panel grid gap-4 p-5 ring-1 ring-brand/25 sm:p-6" aria-labelledby="cash-balance">
        <div className="grid gap-1">
          <span id="cash-balance" className="flex items-center gap-2 text-sm font-semibold text-brand">
            <Coins className="size-4" aria-hidden />
            {t("balance")}
          </span>
          <span className={cn("text-[clamp(2rem,9vw,3rem)] leading-none font-bold tracking-tight tabular-nums", balance < 0 && "text-bad")}>{baht(fromSatang(balance))}</span>
          <span className="text-xs text-muted-foreground">
            {lastCount ? t("lastCount", { day: dayOf(lastCount.move.day) }) : t("neverCounted")}
            {lastCount?.diff ? <b className={cn("ml-1 font-semibold", lastCount.diff < 0 ? "text-bad" : "text-ok")}>{t("diff", { amount: signed(lastCount.diff) })}</b> : null}
          </span>
          {several && (
            <span className="mt-1 flex flex-wrap gap-1.5">
              {books.map((b) => {
                const br = branches.find((x) => x.id === b.id);
                return (
                  <span key={b.id} className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums">
                    {br ? branchLabel(br, names) : "–"} <b className="font-semibold">{baht(fromSatang(b.balance))}</b>
                  </span>
                );
              })}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => start("in")}>
            <ArrowDownLeft className="size-4 text-ok" />
            {t("kind.in")}
          </Button>
          <Button type="button" className="h-12 rounded-2xl" onClick={() => start("out")}>
            <ArrowUpRight className="size-4" />
            {t("kind.out")}
          </Button>
          <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => start("count")}>
            <Scale className="size-4" />
            {t("kind.count")}
          </Button>
        </div>
      </section>

      {/* This month in four numbers */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={monthLabel(month)}>
        <Figure label={t("sumIn")} value={sum.in} />
        <Figure label={t("sumOut")} value={sum.out} />
        <Figure label={t("sumNoReceipt")} value={sum.noReceipt} tone={sum.noReceipt ? "warn" : undefined} hint={t("sumNoReceiptHint")} />
        <Figure label={t("sumDiff")} value={sum.diff} tone={sum.diff < 0 ? "bad" : undefined} signed />
      </section>

      <section className="workspace-panel grid p-0" aria-labelledby="cash-list">
        <h2 id="cash-list" className="px-5 pt-4 pb-2 text-lg font-semibold tracking-tight">
          {t("list")}
        </h2>
        {!loaded ? (
          <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : rows.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <Line key={r.move.id} r={r} dayOf={dayOf} isAdmin={isAdmin} onOpen={() => setDraft({ ...r.move })} />
            ))}
          </ul>
        )}
      </section>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("note")}</p>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        {draft && <Sheet draft={draft} onDone={() => setDraft(null)} />}
      </Dialog>
    </div>
  );
}

const signed = (satang: number) => `${satang > 0 ? "+" : satang < 0 ? "−" : ""}${baht(fromSatang(Math.abs(satang)))}`;

function Figure({ label, value, tone, hint, signed: sign }: { label: string; value: number; tone?: "warn" | "bad"; hint?: string; signed?: boolean }) {
  return (
    <div className="workspace-panel grid min-w-0 content-start gap-0.5 px-3.5 py-3" title={hint}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className={cn("truncate text-[15px] font-semibold tabular-nums", !value && "text-muted-foreground/60", value && tone === "warn" && "text-warn", value && tone === "bad" && "text-bad")}>
        {sign ? signed(value) : baht(fromSatang(value))}
      </span>
    </div>
  );
}

function Line({ r, dayOf, isAdmin, onOpen }: { r: CashRow; dayOf: (d: string) => string; isAdmin: boolean; onOpen: () => void }) {
  const t = useTranslations("cash");
  const m = r.move;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await deleteCash(m.id);
      toast.success(t("deleted"));
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <button type="button" onClick={onOpen} className="press flex min-w-0 flex-1 items-center gap-3 text-left">
        {m.kind === "out" && m.category ? (
          <CategoryIcon category={m.category} />
        ) : (
          <span className={cn("grid size-10 flex-none place-items-center rounded-2xl", m.kind === "in" ? "bg-ok-soft text-ok" : "bg-muted text-foreground")} aria-hidden>
            {m.kind === "in" ? <ArrowDownLeft className="size-5" /> : <Scale className="size-5" />}
          </span>
        )}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[15px] font-semibold">{m.memo || t(`kind.${m.kind}`)}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{dayOf(m.day)}</span>
            {m.kind === "out" &&
              (m.receipt ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                  <ReceiptText className="size-3" aria-hidden />
                  {t("hasReceipt")}
                </span>
              ) : (
                <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">{t("noReceipt")}</span>
              ))}
            {r.diff ? <span className={cn("font-semibold", r.diff < 0 ? "text-bad" : "text-ok")}>{t("diff", { amount: signed(r.diff) })}</span> : null}
          </span>
        </span>
        <span className="grid flex-none text-right">
          <span className={cn("text-[15px] font-semibold tabular-nums", m.kind === "in" && "text-ok")}>
            {m.kind === "in" ? "+" : m.kind === "out" ? "−" : ""}
            {baht(m.amount)}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{t("after", { amount: baht(fromSatang(r.after)) })}</span>
        </span>
      </button>
      {isAdmin &&
        (asking ? (
          <Button type="button" variant="destructive" className="h-10 flex-none rounded-full px-3 text-xs" disabled={busy} onClick={() => void remove()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {t("deleteSure")}
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="icon" className="size-10 flex-none rounded-full text-muted-foreground hover:text-bad" aria-label={t("delete")} onClick={() => setAsking(true)}>
            <Trash2 className="size-4" />
          </Button>
        ))}
    </li>
  );
}

function Sheet({ draft, onDone }: { draft: CashDraft; onDone: () => void }) {
  const t = useTranslations("cash");
  const names = useBranchName();
  const { branches } = useBranches();
  const [d, setD] = useState<CashDraft>(draft);
  const [busy, setBusy] = useState(false);
  const options = useCategoryOptions(d.category ?? undefined);
  const ok = d.amount > 0 || (d.kind === "count" && d.amount >= 0);

  const save = async () => {
    setBusy(true);
    try {
      await saveCash(d);
      toast.success(t("saved"));
      onDone();
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t(`sheet.${d.kind}`)}</DialogTitle>
        <DialogDescription className="text-xs">{t(`sheetHint.${d.kind}`)}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) void save();
        }}
      >
        {!draft.id && (
          <div className="flex rounded-full bg-muted p-1" role="group" aria-label={t("kindLabel")}>
            {(["in", "out", "count"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={d.kind === k}
                onClick={() => setD({ ...d, kind: k, category: k === "out" ? (d.category ?? "food") : null, receipt: k === "out" ? d.receipt : false })}
                className={cn("h-10 flex-1 rounded-full text-sm", d.kind === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
              >
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
        )}
        {branches.length > 1 && (
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">{t("branch")}</span>
            <select value={d.branchId} onChange={(e) => setD({ ...d, branchId: e.target.value })} className="h-11 rounded-xl border bg-background px-3 text-sm">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {branchLabel(b, names)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-sm font-medium">{t("day")}</span>
            <Input type="date" value={d.day} max={todayBangkok()} onChange={(e) => setD({ ...d, day: e.target.value })} className="h-11" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">{d.kind === "count" ? t("counted") : t("amount")}</span>
            <MoneyInput className="h-11 text-[15px]" value={d.amount} onChange={(v) => setD({ ...d, amount: Number(v) || 0 })} />
          </label>
        </div>
        {d.kind === "out" && (
          <>
            <label className="grid gap-1">
              <span className="text-sm font-medium">{t("category")}</span>
              <select value={d.category ?? ""} onChange={(e) => setD({ ...d, category: e.target.value as Category })} className="h-11 rounded-xl border bg-background px-3 text-sm">
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3.5">
              <Switch className="mt-0.5" checked={d.receipt} onCheckedChange={(on) => setD({ ...d, receipt: on })} />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{t("receiptToggle")}</span>
                <span className="text-xs leading-snug text-muted-foreground">{d.receipt ? t("receiptYes") : t("receiptNo")}</span>
              </span>
            </label>
          </>
        )}
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("memo")}</span>
          <Input value={d.memo} maxLength={200} placeholder={t(`memoHint.${d.kind}`)} onChange={(e) => setD({ ...d, memo: e.target.value })} className="h-11" />
        </label>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onDone}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="rounded-full" disabled={busy || !ok}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
