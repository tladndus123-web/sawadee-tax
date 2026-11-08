import type { Locale } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { AddDocButtons } from "@/components/upload/AddDocButtons";

/** Home = dashboard (PROMPT step 8) with the upload button up front */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-4 md:gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("dash.title")}</h1>
        {/* Phones: the raised + in the tab bar does this (2026-11-09 mobile check: the numbers started half-way down) */}
        <AddDocButtons className="max-md:hidden" />
      </header>
      <Dashboard />
    </div>
  );
}
