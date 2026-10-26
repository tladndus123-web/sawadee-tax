import { setRequestLocale } from "next-intl/server";
import { ExpensesPage } from "@/components/expenses/ExpensesPage";
import type { Locale } from "@/i18n/routing";

export default async function ExpensesRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <ExpensesPage />;
}
