import { setRequestLocale } from "next-intl/server";
import { CashBox } from "@/components/ledger/CashBox";
import type { Locale } from "@/i18n/routing";

export default async function CashPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <CashBox />;
}
