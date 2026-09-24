import { setRequestLocale } from "next-intl/server";
import { VendorList } from "@/components/vendors/VendorList";
import type { Locale } from "@/i18n/routing";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <VendorList />;
}
