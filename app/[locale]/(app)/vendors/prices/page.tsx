import { setRequestLocale } from "next-intl/server";
import { PriceChanges } from "@/components/vendors/PriceChanges";
import type { Locale } from "@/i18n/routing";

/** 거래처별 가격 변화: items bought this month against the last time (lib/price-watch priceBoard) */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <PriceChanges />;
}
