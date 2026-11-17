import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ContractBox } from "@/components/contracts/ContractBox";
import type { Locale } from "@/i18n/routing";

// Contract box (계약서함, admins): lib/contracts, components/contracts/ContractBox. Suspense for useSearchParams (?new=1).
export default async function ContractsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <Suspense>
      <ContractBox />
    </Suspense>
  );
}
