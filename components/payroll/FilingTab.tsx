"use client";

// The month's filings (admins): deadlines (moved past weekends and Thai holidays), what to pay, the printable lists
// for ภ.ง.ด.1 and สปส.1-10, payslips; and the social security rate / wage range, which the government is raising.

import { FileBadge, FileText, Loader2, Printer, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { saveCompany, useCompany } from "@/lib/company-store";
import { fmt } from "@/lib/money";
import { annualDeadlines, payrollDeadlines, payrollSettingsOf, type PayrollSettings } from "@/lib/payroll";
import { loadPayroll, type PayrollLineRow } from "@/lib/payroll-store";
import { useBranch } from "@/lib/branch-store";

export function FilingTab({ month }: { month: string }) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const [lines, setLines] = useState<PayrollLineRow[] | null>(null);
  // The chosen branch's filings ("all branches" = the whole company together)
  const branch = useBranch();
  useEffect(() => {
    setLines(null);
    loadPayroll({ month, branch })
      .then(setLines)
      .catch(() => setLines([]));
  }, [month, branch]);

  const due = payrollDeadlines(month);
  const day = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const sum = (f: (l: PayrollLineRow) => number) => (lines ?? []).reduce((a, l) => a + Math.round(f(l) * 100), 0) / 100;
  // People actually paid this month (a daily worker with no days is left off, as on the lists)
  const paid = new Map<string, number>();
  for (const l of lines ?? []) paid.set(l.employeeId, (paid.get(l.employeeId) ?? 0) + l.gross);
  const people = [...paid.values()].filter((g) => g > 0).length;
  const insured = new Set((lines ?? []).filter((l) => l.ssEmployee > 0).map((l) => l.employeeId)).size;

  const card = (key: "pnd1" | "sso", icon: React.ReactNode, amount: number, count: number, dueText: string) => (
    <div className="workspace-panel hover-lift [--lift:1.015] grid gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-2xl bg-muted" aria-hidden>
          {icon}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-[15px] font-semibold">{t(`${key}Title`)}</p>
          <p className="text-xs leading-snug text-muted-foreground">{t(`${key}What`)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="grid">
          <dt className="text-xs text-muted-foreground">{t("toPay")}</dt>
          <dd className="font-semibold tabular-nums">{fmt(amount)}</dd>
        </div>
        <div className="grid">
          <dt className="text-xs text-muted-foreground">{t("people")}</dt>
          <dd className="tabular-nums">{t("peopleN", { n: count })}</dd>
        </div>
        <div className="grid">
          <dt className="text-xs text-muted-foreground">{t("dueBy")}</dt>
          <dd>{dueText}</dd>
        </div>
      </dl>
      <Button asChild variant="secondary" className="h-10 w-fit rounded-full px-4">
        <Link href={`/payroll/print/${key}/${month}`}>
          <Printer className="size-4" />
          {t("printList")}
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="grid gap-3">
      {!lines ? (
        <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : lines.length === 0 ? (
        <p className="workspace-panel px-5 py-10 text-center text-sm text-muted-foreground">{t("nothingSaved")}</p>
      ) : (
        <>
          {card("pnd1", <FileText className="size-5 text-primary" />, sum((l) => l.wht), people, `${day(due.pnd1Paper)} · ${t("online")} ${day(due.due)}`)}
          {card("sso", <ShieldCheck className="size-5 text-ok" />, sum((l) => l.ssEmployee + l.ssEmployer), insured, day(due.due))}
          <Button asChild variant="secondary" className="h-10 w-fit rounded-full px-4">
            <Link href={`/payroll/print/slip/${month}`}>
              <Printer className="size-4" />
              {t("printSlips")}
            </Link>
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("filingHint")}</p>
        </>
      )}
      <YearDocs year={Number(month.slice(0, 4))} />
      <SsSettings />
    </div>
  );
}

/** The year's papers: ภ.ง.ด.1ก and the employees' 50 ทวิ, due the February after */
function YearDocs({ year }: { year: number }) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const due = annualDeadlines(year);
  const day = (d: string) => new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  return (
    <div className="workspace-panel mt-2 grid gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 flex-none place-items-center rounded-2xl bg-muted" aria-hidden>
          <FileBadge className="size-5 text-primary" />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-[15px] font-semibold">{t("yearDocs", { year })}</p>
          <p className="text-xs leading-snug text-muted-foreground">{t("yearDocsHint", { cert50: day(due.cert50), pnd1a: day(due.pnd1a) })}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" className="h-10 rounded-full px-4">
          <Link href={`/payroll/print/cert50/${year}`}>
            <Printer className="size-4" />
            {t("printCert50")}
          </Link>
        </Button>
        <Button asChild variant="secondary" className="h-10 rounded-full px-4">
          <Link href={`/payroll/print/pnd1a/${year}`}>
            <Printer className="size-4" />
            {t("printPnd1a")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function SsSettings() {
  const t = useTranslations("pay");
  const company = useCompany();
  const [s, setS] = useState<PayrollSettings>(payrollSettingsOf(company.payrollSettings));
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(payrollSettingsOf(company.payrollSettings)), [company.payrollSettings]);

  const save = async () => {
    if (s.ssFloor > s.ssCeiling) return toast.error(t("ssRangeBad"));
    if (s.ssAccount && s.ssAccount.length !== 10) return toast.error(t("ssAccountBad"));
    setBusy(true);
    try {
      await saveCompany({ payroll_settings: s });
      toast.success(t("ssSaved"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };
  const field = (k: "ssRate" | "ssFloor" | "ssCeiling", label: string, kind: "qty" | "money") => (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <MoneyInput kind={kind} className="h-10 bg-background text-right" value={s[k]} onChange={(v) => setS({ ...s, [k]: Math.max(0, v || 0) })} />
    </label>
  );
  return (
    <div className="workspace-panel mt-2 grid gap-3 p-4">
      <p className="text-sm font-semibold">{t("ssSettings")}</p>
      <p className="text-xs leading-snug text-muted-foreground">{t("ssSettingsHint", { max: fmt((s.ssCeiling * s.ssRate) / 100) })}</p>
      <div className="grid grid-cols-3 gap-2">
        {field("ssRate", t("ssRate"), "qty")}
        {field("ssFloor", t("ssFloor"), "money")}
        {field("ssCeiling", t("ssCeiling"), "money")}
      </div>
      <label className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t("ssAccount")}</span>
        <Input value={s.ssAccount} inputMode="numeric" maxLength={10} placeholder="10xxxxxxxx" onChange={(e) => setS({ ...s, ssAccount: e.target.value.replace(/\D/g, "") })} className="mono h-10 bg-background" />
      </label>
      <Button type="button" variant="secondary" className="h-10 w-fit rounded-full px-4" disabled={busy} onClick={() => void save()}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {t("save")}
      </Button>
    </div>
  );
}
