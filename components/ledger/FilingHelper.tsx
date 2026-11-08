"use client";

// The numbers to type into this month's returns (owner, 2026-11-08: "신고서 숫자 도우미"): what is due in total, the
// ภ.พ.30 boxes in the form's own numbering with a copy button each, the ภ.ง.ด.53 / ภ.ง.ด.3 lists, what to fix first
// and a "filed" tick that is the same tick as the tax calendar's. Follows the branch being worked in, like the input tax
// report. Admins only (the numbers read the whole month's sales and purchases).

import { Check, ChevronLeft, ChevronRight, CircleCheck, Copy, Download, FileText, Loader2, Lock, ReceiptText, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useScreenDate } from "@/components/ScreenDate";
import { Link } from "@/i18n/navigation";
import { monthKey } from "@/lib/archive";
import { ALL, byId } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { setDone, useCalendar } from "@/lib/calendar-store";
import { useCompany } from "@/lib/company-store";
import { summarize } from "@/lib/dashboard";
import { downloadBlob } from "@/lib/attendance-share";
import { buildPp30, buildWhtFiling, carriedIn, filingDeadlines, totalToPay } from "@/lib/filing";
import { pick, useLedger } from "@/lib/ledger-store";
import { dupGroupsIn } from "@/lib/dup-groups";
import { baht, fmt, fromSatang, toSatang } from "@/lib/money";
import { closeMonth, nextMonth, useMonthLocks } from "@/lib/month-lock-store";
import { useMe } from "@/lib/role-store";
import { useSales } from "@/lib/sales-store";
import { canOpen } from "@/lib/screens";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import type { WhtRow } from "@/lib/wht";
import { whtFileName, whtFileText } from "@/lib/wht-file";
import { useMonthLabel } from "./Stickers";

type Tab = "vat" | "53" | "3";

const prevMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
/** What goes on the clipboard: digits and the decimal point only, the way the e-Filing boxes take it */
const plain = (n: number) => n.toFixed(2);

export function FilingHelper({ month }: { month: string }) {
  const t = useTranslations("filing");
  const tl = useTranslations("lock");
  const tw = useTranslations("tax.whtType");
  const sd = useScreenDate();
  const monthLabel = useMonthLabel();
  const me = useMe();
  const company = useCompany();
  const { entries, loaded } = useLedger();
  const { sales, loaded: salesLoaded } = useSales();
  const locks = useMonthLocks();
  const cal = useCalendar();
  const branch = useBranch();
  const { branches } = useBranches();
  const [tab, setTab] = useState<Tab>("vat");
  const [askClose, setAskClose] = useState(false);
  const [closing, setClosing] = useState(false);
  // Box 10: null = worked out from last month (carriedIn), else what the person typed
  const [carried, setCarried] = useState<string | null>(null);
  const today = todayBangkok();

  const ledger = useMemo(() => pick(entries, "ledger"), [entries]);
  // Possible duplicates in the month: said before closing (owner 2026-11-08)
  const dupCount = useMemo(() => dupGroupsIn(ledger, month), [ledger, month]);
  const docs = useMemo(() => ledger.map((e) => ({ id: e.id, doc: e.doc, ack: e.ackFlags })), [ledger]);
  const { pp30, from } = useMemo(() => buildPp30(sales, ledger.map((e) => e.doc), month, company.taxId), [sales, ledger, month, company.taxId]);
  const wht = useMemo(() => buildWhtFiling(docs, month), [docs, month]);
  const toCheck = useMemo(() => summarize(docs, month, company.taxId, today).toCheck, [docs, month, company.taxId, today]);
  const drafts = useMemo(() => pick(entries, "drafts").filter((e) => monthKey(e.doc) === month).length, [entries, month]);
  const due = filingDeadlines(month);

  // Box 10 (overpaid VAT carried from last month): last month's box 12 unless typed over; boxes 11 / 12 follow
  const autoCarry = useMemo(() => carriedIn(sales, ledger.map((e) => e.doc), month, company.taxId), [sales, ledger, month, company.taxId]);
  const carry = carried === null ? toSatang(autoCarry) : Math.max(toSatang(Number(carried.replace(/,/g, "")) || 0), 0);
  const net = toSatang(pp30.toPay) - toSatang(pp30.overpaid) - carry;
  const box11 = fromSatang(Math.max(net, 0));
  const box12 = fromSatang(Math.max(-net, 0));
  const total = fromSatang(toSatang(totalToPay(pp30, wht)) - toSatang(pp30.toPay) + toSatang(box11));

  const vatKey = `vat:${month}`;
  const whtKey = `monthly:${month}`;
  const vatDone = cal.done.has(vatKey) || locks.has(month);
  const whtDone = cal.done.has(whtKey);
  const branchName = branch !== ALL ? byId(branches, branch)?.name : undefined;

  if (me.loaded && (me.role !== "admin" || !canOpen(me, "sales"))) {
    return <p className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">{t("adminOnly")}</p>;
  }

  const copy = async (n: number) => {
    try {
      await navigator.clipboard.writeText(plain(n));
      toast.success(t("copied", { value: fmt(n) }));
    } catch {
      toast.error(t("copyFail", { value: plain(n) }));
    }
  };
  // The attachment list as a text file for RD Prep (lib/wht-file), named the Revenue Department's way
  const saveFile = (form: "53" | "3") => {
    const rows = form === "53" ? wht.pnd53 : wht.pnd3;
    const no = branch !== ALL ? (byId(branches, branch)?.no ?? "") : "";
    downloadBlob(new Blob([whtFileText(rows, form)], { type: "text/plain;charset=utf-8" }), whtFileName(form, company.taxId, month, (no || "0").padStart(6, "0")));
    toast.success(t("file.saved"));
  };
  const tick = async (key: string, on: boolean) => {
    try {
      await setDone(key, on);
      toast.success(on ? t("markedDone") : t("unmarked"));
      // VAT filed → the numbers must not change any more: offer to close the month (admins; the database decides)
      if (on && key === vatKey && !locks.has(month) && me.role === "admin") setAskClose(true);
    } catch {
      toast.error(t("markFail"));
    }
  };
  const close = async () => {
    setClosing(true);
    try {
      await closeMonth(month);
      toast.success(tl("closed", { month: monthLabel(month) }));
      setAskClose(false);
    } catch {
      toast.error(tl("fail"));
    } finally {
      setClosing(false);
    }
  };

  const checks: { tone: "bad" | "warn" | "ok"; title: string; sub?: string; href?: string; cta?: string }[] = [];
  if (wht.badIds.length) checks.push({ tone: "bad", title: t("check.badIds", { count: wht.badIds.length }), sub: t("check.badIdsSub"), href: `/documents/${wht.badIds[0]}`, cta: t("check.open") });
  if (toCheck) checks.push({ tone: "warn", title: t("check.toCheck", { count: toCheck }), sub: t("check.toCheckSub"), href: "/ledger", cta: t("check.toLedger") });
  if (drafts) checks.push({ tone: "warn", title: t("check.drafts", { count: drafts }), sub: t("check.draftsSub"), href: "/ledger", cta: t("check.toLedger") });
  if (from.vatOff) checks.push({ tone: "warn", title: t("check.vatOff"), sub: t("check.vatOffSub"), href: `/sales/report/${month}`, cta: t("check.toSales") });
  if (wht.unpaid) checks.push({ tone: "warn", title: t("check.unpaid", { count: wht.unpaid }), sub: t("check.unpaidSub") });
  checks.push(
    locks.has(month)
      ? { tone: "ok", title: t("check.closed") }
      : { tone: "warn", title: t("check.notClosed"), sub: t("check.notClosedSub") },
  );
  checks.push({ tone: from.saleDays ? "ok" : "warn", title: t("check.saleDays", { days: from.saleDays }), sub: t("check.saleDaysSub", { slips: from.saleSlips }) });

  const ready = loaded && salesLoaded;
  const lines: { no: number; th: string; label: string; value: number; key?: boolean; input?: boolean }[] = [
    { no: 1, th: "ยอดขายในเดือนนี้", label: t("box.1"), value: pp30.sales },
    { no: 2, th: "ยอดขายที่เสียภาษีในอัตราร้อยละ 0", label: t("box.2"), value: pp30.zeroRated },
    { no: 3, th: "ยอดขายที่ได้รับยกเว้น", label: t("box.3"), value: pp30.exempt },
    { no: 4, th: "ยอดขายที่ต้องเสียภาษี", label: t("box.4"), value: pp30.taxable },
    { no: 5, th: "ภาษีขายเดือนนี้", label: t("box.5"), value: pp30.outputVat },
    { no: 6, th: "ยอดซื้อที่มีสิทธินำภาษีซื้อมาหัก", label: t("box.6"), value: pp30.purchases },
    { no: 7, th: "ภาษีซื้อเดือนนี้", label: t("box.7"), value: pp30.inputVat },
    { no: 8, th: "ภาษีที่ต้องชำระเดือนนี้", label: t("box.8"), value: pp30.toPay, key: pp30.toPay > 0 },
    { no: 9, th: "ภาษีที่ชำระเกินเดือนนี้", label: t("box.9"), value: pp30.overpaid },
    { no: 10, th: "ภาษีที่ชำระเกินยกมา", label: t("box.10"), value: fromSatang(carry), input: true },
    { no: 11, th: "ภาษีสุทธิที่ต้องชำระ", label: t("box.11"), value: box11, key: true },
    { no: 12, th: "ภาษีสุทธิที่ชำระเกิน", label: t("box.12"), value: box12 },
  ];

  const tabs: { id: Tab; form: string; sub: string; amount: number }[] = [
    { id: "vat", form: "ภ.พ.30", sub: t("tab.vat"), amount: box11 },
    { id: "53", form: "ภ.ง.ด.53", sub: t("tab.53"), amount: wht.totals.pnd53.tax },
    { id: "3", form: "ภ.ง.ด.3", sub: t("tab.3"), amount: wht.totals.pnd3.tax },
  ];

  const CopyBtn = ({ n, label }: { n: number; label: string }) => (
    <button
      type="button"
      onClick={() => void copy(n)}
      aria-label={label}
      title={label}
      className="press grid size-11 pointer-fine:size-9 flex-none place-items-center rounded-xl text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:bg-muted hover:text-primary"
    >
      <Copy className="size-4" aria-hidden />
    </button>
  );

  const WhtTable = ({ rows, sum, form }: { rows: WhtRow[]; sum: { paid: number; tax: number }; form: "53" | "3" }) =>
    rows.length === 0 ? (
      <p className="rounded-2xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">{t("whtNone")}</p>
    ) : (
      <div className="overflow-x-auto rounded-2xl shadow-[0_0_0_1px_var(--border)]">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left text-[12px] text-muted-foreground">
              <th className="px-3 py-2 font-medium">{t(form === "53" ? "col.company" : "col.person")}</th>
              <th className="px-3 py-2 font-medium">{t("col.kind")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("col.rate")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("col.paid")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("col.tax")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-3 py-2.5">
                  <Link href={`/documents/${r.id}`} className="font-medium hover:text-primary hover:underline">
                    {r.name.th || r.name.en || r.name.ja || "—"}
                  </Link>
                  <span className={cn("block font-mono text-[12px] tabular-nums", wht.badIds.includes(r.id) ? "font-semibold text-bad" : "text-muted-foreground")}>
                    {wht.badIds.includes(r.id) ? t("noTaxId") : r.taxId}
                  </span>
                </td>
                <td className="px-3 py-2.5">{r.type ? tw(r.type) : tw("service")}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.rate}%</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(r.paid)}</td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmt(r.tax)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-brand-soft font-semibold">
              <td className="px-3 py-2.5" colSpan={3}>
                {t("whtTotal", { count: rows.length })}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmt(sum.paid)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-brand">{fmt(sum.tax)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
          <p className="max-w-2xl text-[15px] text-muted-foreground">{branchName ? t("subBranch", { branch: branchName }) : t("sub")}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-[0_0_0_1px_var(--border)]" aria-label={t("month")}>
          <Link href={`/ledger/filing/${prevMonth(month)}`} aria-label={t("prev")} className="press grid size-11 pointer-fine:size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <span className="px-2 text-[15px] font-semibold tabular-nums">{monthLabel(month)}</span>
          <Link href={`/ledger/filing/${nextMonth(month)}`} aria-label={t("next")} className="press grid size-11 pointer-fine:size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>

      {/* What is due */}
      <section className="grid gap-4 rounded-[28px] bg-primary p-5 text-primary-foreground sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-end sm:p-6" aria-label={t("totalLabel")}>
        <div className="grid gap-1">
          <span className="text-[13px] opacity-80">{t("totalLabel")}</span>
          <span className="text-[32px] leading-none font-semibold tracking-tight tabular-nums sm:text-[38px]">{ready ? baht(total) : "…"}</span>
          <span className="text-[13px] opacity-80">{checks.some((c) => c.tone !== "ok") ? t("totalTodo") : t("totalReady")}</span>
        </div>
        {(
          [
            { form: "ภ.พ.30", label: t("tab.vat"), amount: box11, d: due.vat, done: vatDone },
            { form: "ภ.ง.ด.3 · 53", label: t("whtShort"), amount: fromSatang(toSatang(wht.totals.pnd53.tax) + toSatang(wht.totals.pnd3.tax)), d: due.wht, done: whtDone },
          ] as const
        ).map((x) => (
          <div key={x.form} className="grid gap-1">
            <span className="text-[13px] opacity-80">
              <span lang="th">{x.form}</span> · {x.label}
            </span>
            <span className="text-[22px] leading-tight font-semibold tabular-nums">{ready ? baht(x.amount) : "…"}</span>
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
                x.done ? "bg-white/20 text-primary-foreground" : today > x.d.online ? "bg-bad text-white" : "bg-white text-primary",
              )}
            >
              {x.done ? <Check className="size-3.5" aria-hidden /> : null}
              {x.done ? t("filed") : t("dueBy", { paper: sd(x.d.due), online: sd(x.d.online) })}
            </span>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section className="workspace-panel grid gap-0 overflow-hidden">
          <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border p-1.5">
            {tabs.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                onClick={() => setTab(x.id)}
                className={cn("press grid flex-none gap-0 rounded-2xl px-3.5 py-2 text-left", tab === x.id ? "bg-brand-soft" : "hover:bg-muted")}
              >
                <span lang="th" className={cn("text-[15px] font-semibold", tab === x.id && "text-brand")}>
                  {x.form}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {x.sub} · <span className="tabular-nums">{ready ? fmt(x.amount) : "…"}</span>
                </span>
              </button>
            ))}
          </div>

          {!ready ? (
            <Loader2 className="mx-auto my-12 size-6 animate-spin text-muted-foreground" aria-label="Loading" />
          ) : tab === "vat" ? (
            <div className="grid gap-4 p-4 sm:p-5" role="tabpanel">
              <p className="text-[13px] text-muted-foreground">{t("vatHint")}</p>
              <ol className="grid overflow-hidden rounded-2xl shadow-[0_0_0_1px_var(--border)]">
                {lines.map((l) => (
                  <li
                    key={l.no}
                    className={cn(
                      "grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-3 py-2.5 first:border-t-0 sm:grid-cols-[32px_minmax(0,1fr)_auto_auto]",
                      l.key && "bg-brand-soft",
                    )}
                  >
                    <span className={cn("grid size-8 place-items-center rounded-lg font-mono text-[13px] font-semibold", l.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{l.no}</span>
                    <span className="grid min-w-0">
                      <span className="text-[14px] font-medium">{l.label}</span>
                      <span lang="th" className="truncate text-[12px] text-muted-foreground">
                        {l.th}
                      </span>
                    </span>
                    {l.input ? (
                      <input
                        id="filing-carried"
                        inputMode="decimal"
                        value={carried ?? (autoCarry ? plain(autoCarry) : "")}
                        onChange={(e) => setCarried(e.target.value.replace(/[^\d.,]/g, ""))}
                        placeholder="0.00"
                        aria-label={l.label}
                        className="col-span-2 h-9 w-full rounded-xl bg-card px-3 text-right tabular-nums shadow-[0_0_0_1px_var(--border)] outline-none focus:shadow-[0_0_0_2px_var(--primary)] max-sm:col-start-2 sm:col-span-1 sm:w-36"
                      />
                    ) : (
                      <span className={cn("text-right font-semibold tabular-nums whitespace-nowrap max-sm:col-start-2 max-sm:text-left", l.key ? "text-[17px] text-brand" : "text-[15px]", l.value === 0 && !l.key && "font-normal text-muted-foreground")}>
                        {fmt(l.value)}
                      </span>
                    )}
                    {!l.input && (
                      <span className="max-sm:col-start-3 max-sm:row-span-2 max-sm:row-start-1">
                        <CopyBtn n={l.value} label={t("copyBox", { no: l.no })} />
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {(autoCarry > 0 || carried !== null) && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-brand-soft px-4 py-2.5 text-[13px]">
                  <span>{carried === null ? t("carryAuto", { amount: baht(autoCarry) }) : t("carryTyped", { amount: baht(autoCarry) })}</span>
                  {carried !== null && (
                    <button type="button" onClick={() => setCarried(null)} className="font-medium text-primary hover:underline">
                      {t("carryReset")}
                    </button>
                  )}
                </p>
              )}
              <details className="group rounded-2xl bg-muted/50 px-4 py-3 text-[13px]">
                <summary className="-my-1 cursor-pointer py-3 pointer-fine:my-0 pointer-fine:py-0 font-medium text-primary">{t("from.title")}</summary>
                <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
                  <li>{t("from.sales", { days: from.saleDays, slips: from.saleSlips })}</li>
                  <li>{t("from.claim", { count: from.claimDocs })}</li>
                  {from.otherDocs > 0 && <li>{t("from.other", { count: from.otherDocs, vat: baht(from.otherVat) })}</li>}
                  <li>{t("from.left")}</li>
                  <li>{t("from.zero")}</li>
                </ul>
              </details>
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:p-5" role="tabpanel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-xl text-[13px] text-muted-foreground">{t(tab === "53" ? "hint53" : "hint3")}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-muted-foreground">{t("copyTotal")}</span>
                  <CopyBtn n={tab === "53" ? wht.totals.pnd53.tax : wht.totals.pnd3.tax} label={t("copyTotal")} />
                </div>
              </div>
              {tab === "53" ? <WhtTable rows={wht.pnd53} sum={wht.totals.pnd53} form="53" /> : <WhtTable rows={wht.pnd3} sum={wht.totals.pnd3} form="3" />}
              <div className="grid gap-3 rounded-2xl bg-muted/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid gap-0.5">
                    <span className="text-[14px] font-semibold">{t("file.title")}</span>
                    <span className="text-[13px] text-muted-foreground">{t("file.sub")}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!(tab === "53" ? wht.pnd53 : wht.pnd3).length}
                    onClick={() => saveFile(tab as "53" | "3")}
                    className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Download className="size-4" aria-hidden />
                    {t("file.button", { form: tab === "53" ? "ภ.ง.ด.53" : "ภ.ง.ด.3" })}
                  </button>
                </div>
                {(tab === "53" ? wht.pnd53 : wht.pnd3).some((r) => wht.badIds.includes(r.id)) && <p className="text-[13px] font-medium text-bad">{t("file.badIds")}</p>}
                <details className="text-[13px]">
                  <summary className="-my-1 cursor-pointer py-3 pointer-fine:my-0 pointer-fine:py-0 font-medium text-primary">{t("file.how")}</summary>
                  <ol className="mt-2 grid list-decimal gap-1 pl-5 text-muted-foreground">
                    {(["1", "2", "3", "4", "5"] as const).map((k) => (
                      <li key={k}>{t(`file.steps.${k}`)}</li>
                    ))}
                  </ol>
                </details>
              </div>
            </div>
          )}
        </section>

        <aside className="grid gap-5">
          <section className="workspace-panel grid gap-3 p-4 sm:p-5">
            <h2 className="text-[15px] font-semibold">{t("check.title")}</h2>
            <ul className="grid gap-3">
              {checks.map((c, i) => (
                <li key={i} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2.5 text-[14px]">
                  {c.tone === "ok" ? (
                    <CircleCheck className="mt-0.5 size-5 text-ok" aria-hidden />
                  ) : (
                    <TriangleAlert className={cn("mt-0.5 size-5", c.tone === "bad" ? "text-bad" : "text-warn")} aria-hidden />
                  )}
                  <span className="grid gap-0.5">
                    <span className="font-medium">{c.title}</span>
                    {c.sub && <span className="text-[13px] text-muted-foreground">{c.sub}</span>}
                    {c.href && (
                      <Link href={c.href} className="w-fit text-[13px] font-medium text-primary hover:underline">
                        {c.cta} →
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="workspace-panel grid gap-3 p-4 sm:p-5">
            <h2 className="text-[15px] font-semibold">{t("steps.title")}</h2>
            <ol className="grid list-decimal gap-1.5 pl-5 text-[14px] text-muted-foreground">
              <li>{t("steps.1")}</li>
              <li>{t("steps.2")}</li>
              <li>{t("steps.3")}</li>
              <li>{t("steps.4")}</li>
            </ol>
            <div className="grid gap-2">
              {(
                [
                  { key: vatKey, done: vatDone, locked: locks.has(month) && !cal.done.has(vatKey), label: t("markVat") },
                  { key: whtKey, done: whtDone, locked: false, label: t("markWht") },
                ] as const
              ).map((b) => (
                <button
                  key={b.key}
                  type="button"
                  disabled={b.locked}
                  onClick={() => void tick(b.key, !b.done)}
                  className={cn(
                    "press inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-medium",
                    b.done ? "bg-ok-soft text-ok" : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {b.done && <Check className="size-4" aria-hidden />}
                  {b.done ? t("doneLabel", { what: b.label }) : b.label}
                </button>
              ))}
              {askClose && !locks.has(month) && (
                <div className="grid gap-2 rounded-2xl bg-brand-soft p-3.5" role="status">
                  <p className="flex items-center gap-2 text-[14px] font-semibold">
                    <Lock className="size-4 text-brand" aria-hidden />
                    {t("closeAsk", { month: monthLabel(month) })}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">{t("closeWhy")}</p>
                  {dupCount > 0 && (
                    <Link href="/ledger?status=dup" className="flex items-center gap-1.5 rounded-xl bg-bad-soft px-3 py-2 text-[13px] font-semibold text-bad hover:underline">
                      {tl("dups", { count: dupCount })} · {tl("dupsGo")} →
                    </Link>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={closing} onClick={() => void close()} className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[14px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                      {closing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                      {t("closeYes")}
                    </button>
                    <button type="button" disabled={closing} onClick={() => setAskClose(false)} className="press inline-flex h-10 items-center rounded-full bg-card px-4 text-[14px] font-medium shadow-[0_0_0_1px_var(--border)] hover:bg-muted">
                      {t("closeLater")}
                    </button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/ledger/report/${month}`} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-[13px] font-medium hover:bg-muted">
                  <FileText className="size-4 text-bad" aria-hidden />
                  {t("inputReport")}
                </Link>
                <Link href={`/ledger/wht/${month}`} className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-secondary px-3 text-[13px] font-medium hover:bg-muted">
                  <ReceiptText className="size-4 text-muted-foreground" aria-hidden />
                  {t("whtList")}
                </Link>
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">{t("note")}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
