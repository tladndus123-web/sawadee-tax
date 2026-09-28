import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { type PayForm, PayrollPrint } from "@/components/payroll/PayrollPrint";
import type { Locale } from "@/i18n/routing";

const FORMS: PayForm[] = ["slip", "pnd1", "sso"];

export default async function PayrollPrintPage({ params }: { params: Promise<{ locale: string; form: string; month: string }> }) {
  const { locale, form, month } = await params;
  setRequestLocale(locale as Locale);
  if (!FORMS.includes(form as PayForm) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  return <PayrollPrint form={form as PayForm} month={month} />;
}
