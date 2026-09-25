import type { Locale } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, ImagePlus } from "lucide-react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { MaxNotice } from "@/components/upload/MaxNotice";
import { Link } from "@/i18n/navigation";

/** Home = dashboard (PROMPT step 8) with the upload button up front */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  return (
    <div className="mx-auto grid max-w-6xl gap-6 md:gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="ai-text text-[13px] font-semibold tracking-tight">{t("app.appName")}</p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("dash.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/documents/sample" className="flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-medium text-primary hover:bg-primary/10">
            {t("dash.sample")}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/upload"
            className="flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-medium text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/12%)] transition-[transform,background-color] hover:bg-primary/90 active:scale-[0.97]"
          >
            <ImagePlus className="size-4" aria-hidden />
            {t("batch.cta")}
          </Link>
        </div>
      </header>
      <MaxNotice className="-mt-3" />
      <Dashboard />
    </div>
  );
}
