"use client";

// A document typed by hand (no photo): an empty full tax invoice dated today, opened in edit mode. Pick the
// vendor to fill the seller, type each text in any one language — the other two are translated on save.

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { DocumentReview } from "@/components/invoice/DocumentReview";
import { useRouter } from "@/i18n/navigation";
import { useCompany } from "@/lib/company-store";
import { saveEntry } from "@/lib/ledger-store";
import { normalize } from "@/lib/normalize";
import { todayBangkok } from "@/lib/thai-tax";
import type { LedgerDoc } from "@/lib/types";

export function ManualReview() {
  const t = useTranslations();
  const router = useRouter();
  const company = useCompany();
  const [initial] = useState(() => normalize({ docType: "full", copyKind: "original", date: todayBangkok(), confidence: "high" }));
  // The buyer on a purchase document is our company
  const withBuyer = (d: LedgerDoc): LedgerDoc =>
    d.customer.taxId || !company.taxId ? d : { ...d, customer: { ...d.customer, taxId: company.taxId } };

  return (
    <div className="grid gap-4">
      <h1 className="sr-only">{t("manual.title")}</h1>
      <DocumentReview
        initial={initial}
        photoUrl={null}
        isNew
        startEditing
        companyTaxId={company.taxId}
        onSave={async (d) => {
          const { id } = await saveEntry(withBuyer(d), null, undefined, "final", company.taxId);
          toast.success(t("trash.saved"));
          router.push(`/documents/${id}`);
        }}
        onDraft={async (d) => {
          await saveEntry(withBuyer(d), null, undefined, "draft", company.taxId);
          toast.success(t("archive.drafted"));
          router.push("/ledger");
        }}
        onClose={() => router.push("/upload")}
      />
    </div>
  );
}
