import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { MonthReport } from "@/components/ledger/MonthReport";
import type { Locale } from "@/i18n/routing";

export default async function ReportPage({ params }: { params: Promise<{ locale: string; month: string }> }) {
  const { locale, month } = await params;
  setRequestLocale(locale as Locale);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  return <MonthReport month={month} />;
}
