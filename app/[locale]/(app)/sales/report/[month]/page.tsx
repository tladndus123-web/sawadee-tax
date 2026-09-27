import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { SalesReport } from "@/components/sales/SalesReport";
import type { Locale } from "@/i18n/routing";

export default async function SalesReportPage({ params }: { params: Promise<{ locale: string; month: string }> }) {
  const { locale, month } = await params;
  setRequestLocale(locale as Locale);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  return <SalesReport month={month} />;
}
