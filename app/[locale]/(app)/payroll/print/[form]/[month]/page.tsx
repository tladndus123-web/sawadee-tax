import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { type PayForm, PayrollPrint } from "@/components/payroll/PayrollPrint";
import { type YearForm, YearPrint } from "@/components/payroll/YearPrint";
import type { Locale } from "@/i18n/routing";

const MONTHLY: PayForm[] = ["slip", "pnd1", "sso"];
const YEARLY: YearForm[] = ["pnd1a", "cert50"];

/** /payroll/print/<form>/<YYYY-MM> for the month's papers, /payroll/print/<form>/<YYYY> for the year's */
export default async function PayrollPrintPage({ params }: { params: Promise<{ locale: string; form: string; month: string }> }) {
  const { locale, form, month } = await params;
  setRequestLocale(locale as Locale);
  if (MONTHLY.includes(form as PayForm) && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return <PayrollPrint form={form as PayForm} month={month} />;
  if (YEARLY.includes(form as YearForm) && /^\d{4}$/.test(month)) return <YearPrint form={form as YearForm} year={month} />;
  notFound();
}
