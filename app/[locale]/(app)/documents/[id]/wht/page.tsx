import { setRequestLocale } from "next-intl/server";
import { WhtCertificate } from "@/components/invoice/WhtCertificate";
import type { Locale } from "@/i18n/routing";

/** The 50 ทวิ withholding tax certificate of one document, ready to print */
export default async function WhtCertificatePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  return <WhtCertificate id={id} />;
}
