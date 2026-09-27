import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { SampleReview } from "./SampleReview";
import { StoredReview } from "./StoredReview";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ check?: string }>;
}) {
  const { locale, id } = await params;
  const { check } = await searchParams;
  setRequestLocale(locale as Locale);
  // ?check=1: opened from "check one by one" — saving moves on to the next document that needs a look
  return id === "sample" ? <SampleReview /> : <StoredReview id={id} checkRun={check === "1"} />;
}
