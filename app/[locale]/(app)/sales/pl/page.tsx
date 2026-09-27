import { setRequestLocale } from "next-intl/server";
import { PlReport } from "@/components/sales/PlReport";
import type { Locale } from "@/i18n/routing";

export default async function PlPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <PlReport />;
}
