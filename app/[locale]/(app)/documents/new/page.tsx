import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { ManualReview } from "./ManualReview";

export default async function NewDocumentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <ManualReview />;
}
