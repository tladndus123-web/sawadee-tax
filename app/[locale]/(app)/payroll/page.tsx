import { setRequestLocale } from "next-intl/server";
import { PayrollPage } from "@/components/payroll/PayrollPage";
import type { Locale } from "@/i18n/routing";

export default async function Payroll({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <PayrollPage />;
}
