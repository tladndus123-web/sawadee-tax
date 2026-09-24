import { Hourglass } from "lucide-react";
import { getTranslations } from "next-intl/server";

// Temporary placeholder for pages built in later steps
export async function ComingSoon({ titleKey }: { titleKey: "ledger" | "vendors" | "settings" }) {
  const t = await getTranslations();
  return (
    <div className="grid gap-6">
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t(`nav.${titleKey}`)}</h1>
      <div className="workspace-panel grid place-items-center gap-4 px-6 py-20 text-center">
        <span className="intelligence-mark is-soft size-14 text-muted-foreground"><Hourglass className="size-6" aria-hidden /></span>
        <p className="text-[15px] text-muted-foreground">{t("common.comingSoon")}</p>
      </div>
    </div>
  );
}
