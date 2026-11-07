import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { FilingHelper } from "@/components/ledger/FilingHelper";
import type { Locale } from "@/i18n/routing";

/** The numbers for a month's ภ.พ.30 and ภ.ง.ด.3 / 53 returns (admins) */
export default async function FilingPage({ params }: { params: Promise<{ locale: string; month: string }> }) {
  const { locale, month } = await params;
  setRequestLocale(locale as Locale);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  return <FilingHelper month={month} />;
}
