import { getTranslations } from "next-intl/server";
import { SessionWatch } from "@/components/auth/SessionWatch";
import { StoredFormConfig } from "@/components/invoice/StoredFormConfig";
import { AppHeader } from "@/components/layout/app-header";
import { BranchGate } from "@/components/auth/BranchGate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  return (
    <div className="flex min-h-dvh flex-col">
      <SessionWatch />
      <AppHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 outline-none sm:px-6 md:py-8 lg:px-8 lg:py-10">
        {/* After signing in: which branch (staff type its PIN) */}
        <BranchGate>
          <StoredFormConfig>{children}</StoredFormConfig>
        </BranchGate>
      </main>
      {/* Bottom padding clears the mobile tab bar */}
      <footer className="mx-auto w-full max-w-[1440px] px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] text-center text-[11px] leading-relaxed text-muted-foreground sm:px-6 md:pb-10 lg:px-8">{t("foot")}</footer>
    </div>
  );
}
