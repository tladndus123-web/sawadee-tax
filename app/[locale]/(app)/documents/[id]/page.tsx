import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { SampleReview } from "./SampleReview";
import { StoredReview } from "./StoredReview";

export default async function DocumentPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  // The sample is built in; everything else comes from the temporary ledger until the database exists (step 5)
  return id === "sample" ? <SampleReview /> : <StoredReview id={id} />;
}
