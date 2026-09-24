import { setRequestLocale } from "next-intl/server";
import { BatchUpload } from "@/components/upload/BatchUpload";
import type { Locale } from "@/i18n/routing";

export default async function UploadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <BatchUpload />;
}
