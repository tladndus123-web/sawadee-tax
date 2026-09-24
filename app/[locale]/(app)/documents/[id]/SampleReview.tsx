"use client";

// Step 4: shows sample-document.json without a database. Saving puts a copy in the temporary ledger.

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { DocumentReview } from "@/components/invoice/DocumentReview";
import { useRouter } from "@/i18n/navigation";
import { saveEntry } from "@/lib/ledger-store";
import { sampleDoc } from "@/lib/sample";

const PHOTO = "/sample/panfood.jpg";

// Hand-measured boxes for the two unclear fields; the AI supplies these from step 6
const doc = {
  ...sampleDoc(),
  id: "sample",
  fieldBoxes: {
    "customer.name": [0.075, 0.258, 0.15, 0.022],
    "sales.name": [0.145, 0.318, 0.2, 0.02],
  } as Record<string, [number, number, number, number]>,
};

export function SampleReview() {
  const t = useTranslations();
  const router = useRouter();
  return (
    <div className="grid gap-4">
      <h1 className="sr-only">{t("review.sampleTitle")}</h1>
      <DocumentReview
        initial={doc}
        photoUrl={PHOTO}
        isSample
        companyTaxId=""
        others={[]}
        onSave={async (d) => {
          const photo = await fetch(PHOTO).then((r) => r.blob()).catch(() => null);
          await saveEntry({ ...d, id: undefined }, photo, crypto.randomUUID());
          toast.success(t("trash.saved"));
          router.push("/ledger");
        }}
        onDraft={async (d) => {
          const photo = await fetch(PHOTO).then((r) => r.blob()).catch(() => null);
          await saveEntry({ ...d, id: undefined }, photo, crypto.randomUUID(), "draft");
          toast.success(t("archive.drafted"));
          router.push("/ledger");
        }}
        onDelete={async () => {}}
        onDeleted={() => {
          toast.info(t("del.sampleDone"));
          router.push("/");
        }}
        onClose={() => router.push("/")}
      />
    </div>
  );
}
