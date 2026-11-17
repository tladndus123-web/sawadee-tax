import { setRequestLocale } from "next-intl/server";
import { PayablesPage } from "@/components/ledger/PayablesPage";
import type { Locale } from "@/i18n/routing";

/** 줄 돈: every unpaid bill by due date and supplier (admins) */
export default async function Payables({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <PayablesPage />;
}
