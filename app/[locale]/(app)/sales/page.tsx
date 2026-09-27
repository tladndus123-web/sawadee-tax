import { setRequestLocale } from "next-intl/server";
import { SalesPage } from "@/components/sales/SalesPage";
import type { Locale } from "@/i18n/routing";

export default async function Sales({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <SalesPage />;
}
