"use client";

// A document typed by hand (no photo): an empty full tax invoice dated today, on the quick card. Pick the vendor
// (or type the seller in one language) and fill the total — the other languages are translated on save.
// It starts as a proper tax invoice (§86/4): titled "ใบกำกับภาษี", with the buyer (our company) copied from the
// newest document addressed to us, and one item line for what was bought.

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";
import { DocumentReview } from "@/components/invoice/DocumentReview";
import { useRouter } from "@/i18n/navigation";
import { assignBranch } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { useCompany } from "@/lib/company-store";
import { pick, saveEntry, useLedger } from "@/lib/ledger-store";
import { manualStart } from "@/lib/manual-doc";
import { todayBangkok } from "@/lib/thai-tax";

export function ManualReview() {
  const t = useTranslations();
  const router = useRouter();
  const company = useCompany();
  const { entries, loaded } = useLedger();
  const { branches, loaded: branchesLoaded } = useBranches();
  const working = useBranch();
  const ready = company.loaded && loaded && branchesLoaded;
  // Built once both are loaded, so the form starts with the buyer filled in
  const initial = useMemo(
    () => (ready ? assignBranch(manualStart(pick(entries, "ledger").map((e) => e.doc), company.taxId, todayBangkok()), branches, working) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a later ledger refresh must not reset the form
    [ready],
  );

  if (!initial) return <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;

  return (
    <div className="grid gap-4">
      <h1 className="sr-only">{t("manual.title")}</h1>
      <DocumentReview
        initial={initial}
        photoUrl={null}
        isNew
        manual
        companyTaxId={company.taxId}
        onSave={async (d) => {
          const { id } = await saveEntry(d, null, undefined, "final", company.taxId);
          toast.success(t("trash.saved"));
          router.push(`/documents/${id}`);
        }}
        onDraft={async (d) => {
          await saveEntry(d, null, undefined, "draft", company.taxId);
          toast.success(t("archive.drafted"));
          router.push("/ledger");
        }}
        onClose={() => router.push("/upload")}
      />
    </div>
  );
}
