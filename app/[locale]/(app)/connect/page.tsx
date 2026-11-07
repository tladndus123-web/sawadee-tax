import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ConnectConsent } from "@/components/settings/ConnectConsent";
import type { Locale } from "@/i18n/routing";

/** An AI agent (Grok Bot) asks to connect to the books; the owner allows or refuses (lib/oauth) */
export default async function ConnectPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <Suspense>
      <ConnectConsent />
    </Suspense>
  );
}
