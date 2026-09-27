import type { Locale } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { AddDocButtons } from "@/components/upload/AddDocButtons";
import { Link } from "@/i18n/navigation";

/** Home = dashboard (PROMPT step 8) with the upload button up front */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 md:gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="ai-text text-[13px] font-semibold tracking-tight">{t("app.appName")}</p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("dash.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/documents/sample" className="press flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-medium text-primary hover:bg-primary/10 active:scale-[0.97]">
            {t("dash.sample")}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <AddDocButtons />
        </div>
      </header>
      <Dashboard />
    </div>
  );
}
