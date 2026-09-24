import type { Locale } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, FileCheck2, ImagePlus, Settings2, Sparkles } from "lucide-react";
import { MaxNotice } from "@/components/upload/BatchUpload";
import { MAX_PHOTOS } from "@/lib/extract-schema";
import { Link } from "@/i18n/navigation";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  return (
    <div className="mx-auto grid max-w-5xl gap-8 pt-2 md:gap-14 md:pt-10">
      <header className="aurora-hero mx-auto grid max-w-3xl justify-items-center pt-8 pb-2 text-center sm:pt-12">
        <span className="ai-orb mb-7 size-16 sm:size-[72px]"><Sparkles className="size-7" aria-hidden /></span>
        <p className="ai-text mb-3 text-sm font-semibold tracking-tight">{t("app.appName")}</p>
        <h1 className="text-[clamp(2rem,5.5vw,3.75rem)] leading-[1.12] font-semibold tracking-[-0.035em] text-balance">{t("ui.workspaceTitle")}</h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-pretty text-muted-foreground sm:text-lg">{t("ui.workspaceIntro")}</p>
        <Link href="/upload" className="mt-8 flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/12%)] transition-[transform,background-color] hover:bg-primary/90 active:scale-[0.97]">
          <ImagePlus className="size-4" aria-hidden />
          {t("batch.cta")}
        </Link>
        <MaxNotice className="mt-4" />
        <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">{t("batch.intro", { max: MAX_PHOTOS })}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-5">
        <Link href="/documents/sample" className="workspace-panel ai-ring launch-card group grid content-between gap-8 rounded-[1.75rem] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <span className="intelligence-mark size-12"><FileCheck2 className="size-6" aria-hidden /></span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{t("app.ex")}</span>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("review.sampleTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{t("ui.sampleIntro")}</p>
            <span className="mt-5 flex items-center gap-1 text-sm font-medium text-primary">
              {t("ui.openSample")}
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </Link>
        <Link href="/settings" className="workspace-panel launch-card group grid content-between gap-8 rounded-[1.75rem] p-6 sm:p-8">
          <span className="intelligence-mark is-soft size-12"><Settings2 className="size-6" aria-hidden /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("settings.formTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{t("ui.settingsIntro")}</p>
            <span className="mt-5 flex items-center gap-1 text-sm font-medium text-primary">
              {t("nav.settings")}
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </Link>
      </div>
      <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">{t("ui.previewNotice")}</p>
    </div>
  );
}
