import { setRequestLocale } from "next-intl/server";
import { ComingSoon } from "@/components/layout/coming-soon";
import type { Locale } from "@/i18n/routing";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <ComingSoon titleKey="vendors" />;
}
