import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { WhtReport } from "@/components/ledger/WhtReport";
import type { Locale } from "@/i18n/routing";

/** Withholding tax paid in a month: the ภ.ง.ด.53 / ภ.ง.ด.3 attachment lists, ready to print */
export default async function WhtPage({ params }: { params: Promise<{ locale: string; month: string }> }) {
  const { locale, month } = await params;
  setRequestLocale(locale as Locale);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  return <WhtReport month={month} />;
}
