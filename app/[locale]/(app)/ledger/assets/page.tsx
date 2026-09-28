import { setRequestLocale } from "next-intl/server";
import { AssetRegister } from "@/components/ledger/AssetRegister";
import type { Locale } from "@/i18n/routing";

export default async function AssetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <AssetRegister />;
}
