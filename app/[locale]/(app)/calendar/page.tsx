import { setRequestLocale } from "next-intl/server";
import { CompanyCalendar } from "@/components/calendar/CompanyCalendar";
import type { Locale } from "@/i18n/routing";

export default async function CalendarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <CompanyCalendar />;
}
