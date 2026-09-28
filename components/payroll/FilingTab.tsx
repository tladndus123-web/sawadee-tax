"use client";

// The month's filings (admins): deadlines (moved past weekends and Thai holidays), what to pay, the printable lists
// for ภ.ง.ด.1 and สปส.1-10, payslips; and the social security rate / wage range, which the government is raising.

import { FileText, Loader2, Printer, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { saveCompany, useCompany } from "@/lib/company-store";
import { fmt } from "@/lib/money";
import { payrollDeadlines, payrollSettingsOf, type PayrollSettings } from "@/lib/payroll";
import { loadPayroll, type PayrollLineRow } from "@/lib/payroll-store";

export function FilingTab({ month }: { month: string }) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const [lines, setLines] = useState<PayrollLineRow[] | null>(null);
  useEffect(() => {
    setLines(null);
    loadPayroll({ month })
      .then(setLines)
      .catch(() => setLines([]));
  }, [month]);

  const due = payrollDeadlines(month);
  const day = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const sum = (f: (l: PayrollLineRow) => number) => (lines ?? []).reduce((a, l) => a + Math.round(f(l) * 100), 0) / 100;
  const people = new Set((lines ?? []).map((l) => l.employeeId)).size;
  const insured = new Set((lines ?? []).filter((l) => l.ssEmployee > 0).map((l) => l.employeeId)).size;

  const card = (key: "pnd1" | "sso", icon: React.ReactNode, amount: number, count: number, dueText: string) => (
    <div className="workspace-panel grid gap-3 p-4">
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
      <SsSettings />
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
  const field = (k: keyof PayrollSettings, label: string, kind: "qty" | "money") => (
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
      <Button type="button" variant="secondary" className="h-10 w-fit rounded-full px-4" disabled={busy} onClick={() => void save()}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {t("save")}
      </Button>
    </div>
  );
}
