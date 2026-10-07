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
    <div className="mx-auto grid w-full max-w-5xl gap-6 md:gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("dash.title")}</h1>
        <AddDocButtons />
      </header>
      <Dashboard />
    </div>
  );
}
