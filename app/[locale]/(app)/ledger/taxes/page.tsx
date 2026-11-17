import { setRequestLocale } from "next-intl/server";
import { TaxesHub } from "@/components/ledger/TaxesHub";
import type { Locale } from "@/i18n/routing";

/** 세금 신고 모아보기: one tax month's returns on one screen (admins) */
export default async function TaxesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <TaxesHub />;
}
