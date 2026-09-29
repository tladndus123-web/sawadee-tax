import { Bell, CalendarClock, FileText, MessageCircle, Shapes, Smartphone, Store, Tag, UserPlus } from "lucide-react";
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
import { FoldAllButton, SettingsFold } from "@/components/settings/SettingsFold";
import type { Locale } from "@/i18n/routing";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations();
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8">
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("settings.title")}</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <AccountCard />
        <CompanyCard />
      </div>
      {/* Everything else folded to one row each: the whole list fits on a phone screen */}
      <div className="grid gap-3">
        <div className="-mb-1 flex justify-end">
          <FoldAllButton />
        </div>
        <SettingsFold icon={<Store className="text-brand" />} title={t("branch.title")}>
          <BranchCard />
        </SettingsFold>
        <SettingsFold icon={<Shapes className="text-brand" />} title={t("cats.title")}>
          <CategoryCard />
        </SettingsFold>
        <SettingsFold icon={<CalendarClock className="text-brand" />} title={t("fixed.title")}>
          <FixedCostCard />
        </SettingsFold>
        <SettingsFold icon={<Smartphone className="text-brand" />} title={t("install.title")}>
          <InstallCard />
        </SettingsFold>
        <SettingsFold icon={<Bell className="text-brand" />} title={t("push.title")}>
          <PushCard />
        </SettingsFold>
        <SettingsFold icon={<MessageCircle className="text-[#06c755]" />} title={t("line.title")}>
          <LineCard />
        </SettingsFold>
        <SettingsFold icon={<UserPlus className="text-primary" />} title={t("members.title")}>
          <MembersCard />
        </SettingsFold>
        <SettingsFold icon={<Tag className="text-primary" />} title={t("archive.stickerNames")}>
          <StickerNameSettings />
        </SettingsFold>
        <SettingsFold icon={<FileText className="text-primary" />} title={t("settings.formTitle")}>
          <FormSettings />
        </SettingsFold>
      </div>
    </div>
  );
}
