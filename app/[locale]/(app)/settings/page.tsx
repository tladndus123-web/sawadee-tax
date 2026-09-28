import { getTranslations, setRequestLocale } from "next-intl/server";
import { FormSettings } from "@/components/settings/FormSettings";
import { AccountCard, CompanyCard } from "@/components/settings/AccountSettings";
import { MembersCard } from "@/components/settings/MembersCard";
import { StickerNameSettings } from "@/components/ledger/Stickers";
import { LineCard } from "@/components/settings/LineCard";
import { BranchCard } from "@/components/settings/BranchCard";
import { CategoryCard } from "@/components/settings/CategoryCard";
import { FixedCostCard } from "@/components/settings/FixedCostCard";
import { InstallCard } from "@/components/settings/InstallCard";
import { PushCard } from "@/components/settings/PushCard";
import type { Locale } from "@/i18n/routing";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("settings");
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8">
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("title")}</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <AccountCard />
        <CompanyCard />
      </div>
      <BranchCard />
      <CategoryCard />
      <FixedCostCard />
      <InstallCard />
      <PushCard />
      <LineCard />
      <MembersCard />
      <StickerNameSettings />
      <FormSettings />
    </div>
  );
}
