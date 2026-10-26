import { Bell, CalendarClock, FileText, MessageCircle, ScanFace, Shapes, Smartphone, Store, Tag, UserPlus } from "lucide-react";
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
import { PasskeyCard } from "@/components/settings/PasskeyCard";
import { PushCard } from "@/components/settings/PushCard";
import { FoldAllButton, SettingsFold, SettingsGroup } from "@/components/settings/SettingsFold";
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
      {/* Everything else folded to one row each, in four groups (owner 2026-10-27): the whole list fits on a phone screen */}
      <div className="grid gap-6">
        <div className="-mb-4 flex justify-end">
          <FoldAllButton />
        </div>
        <SettingsGroup title={t("settings.group.books")}>
          <SettingsFold icon={<Store className="text-brand" />} title={t("branch.title")}>
            <BranchCard />
          </SettingsFold>
          <SettingsFold icon={<Shapes className="text-brand" />} title={t("cats.title")}>
            <CategoryCard />
          </SettingsFold>
          <SettingsFold icon={<CalendarClock className="text-brand" />} title={t("fixed.title")}>
            <FixedCostCard />
          </SettingsFold>
          <SettingsFold icon={<Tag className="text-brand" />} title={t("archive.stickerNames")}>
            <StickerNameSettings />
          </SettingsFold>
          <SettingsFold icon={<FileText className="text-brand" />} title={t("settings.formTitle")}>
            <FormSettings />
          </SettingsFold>
        </SettingsGroup>
        <SettingsGroup title={t("settings.group.team")}>
          <SettingsFold icon={<UserPlus className="text-primary" />} title={t("members.title")}>
            <MembersCard />
          </SettingsFold>
        </SettingsGroup>
        <SettingsGroup title={t("settings.group.notify")}>
          <SettingsFold icon={<MessageCircle className="text-[#06c755]" />} title={t("line.title")}>
            <LineCard />
          </SettingsFold>
          <SettingsFold icon={<Bell className="text-primary" />} title={t("push.title")}>
            <PushCard />
          </SettingsFold>
        </SettingsGroup>
        <SettingsGroup title={t("settings.group.device")}>
          <SettingsFold icon={<ScanFace className="text-primary" />} title={t("passkey.title")}>
            <PasskeyCard />
          </SettingsFold>
          <SettingsFold icon={<Smartphone className="text-primary" />} title={t("install.title")}>
            <InstallCard />
          </SettingsFold>
        </SettingsGroup>
      </div>
    </div>
  );
}
