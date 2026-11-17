import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { WastePage } from "@/components/waste/WastePage";
import type { Locale } from "@/i18n/routing";

/** 폐기 기록 (a restaurant extra, Settings → 음식점 기능) */
export default async function Waste({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  // ?new=1 is read with useSearchParams: a Suspense boundary on a prerendered route
  return (
    <Suspense>
      <WastePage />
    </Suspense>
  );
}
