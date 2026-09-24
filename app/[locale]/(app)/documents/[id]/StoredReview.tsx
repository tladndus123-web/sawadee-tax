"use client";

// A document from the temporary ledger (IndexedDB). Step 5 loads it from Supabase instead.

import { ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ActivityList } from "@/components/dashboard/ActivityList";
import { DocumentReview } from "@/components/invoice/DocumentReview";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { useCompany } from "@/lib/company-store";
import { restoreEntry, saveEntry, softDelete, useLedger, usePhotoUrl } from "@/lib/ledger-store";
import { useMe } from "@/lib/role-store";

export function StoredReview({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const me = useMe();
  const { entries, loaded } = useLedger();
  const entry = entries.find((e) => e.id === id);
  // Same seller + same document number anywhere in the live ledger = possible duplicate
  const others = useMemo(
    () => entries.filter((e) => e.deletedAt === null && e.id !== id).map((e) => ({ id: e.id, docNo: e.doc.docNo, sellerTaxId: e.doc.seller.taxId })),
    [entries, id],
  );
  const photoUrl = usePhotoUrl(entry?.photoPath ?? null);
  const company = useCompany();
  const [restoring, setRestoring] = useState(false);
  // Keeps the delete flow mounted while the shredder plays after the entry turns deleted
  const [deleting, setDeleting] = useState(false);

  if (!loaded) return <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted-foreground" aria-label="Loading" />;

  if (!entry || (entry.deletedAt && me.role !== "admin")) {
    return (
      <div className="workspace-panel mx-auto mt-10 grid max-w-md justify-items-center gap-4 px-6 py-14 text-center">
        <Trash2 className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-[15px] text-muted-foreground">{t("trash.notFound")}</p>
        <Button asChild variant="secondary" className="rounded-full">
          <Link href="/ledger">{t("nav.ledger")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <h1 className="sr-only">{entry.doc.docNo || t("ui.documentForm")}</h1>
      {entry.deletedAt && !deleting && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad print:hidden">
          <span className="font-semibold">
            {t("trash.inTrash")} · {entry.deleteReason}
          </span>
          <Button
            type="button"
            className="rounded-full"
            disabled={restoring}
            onClick={async () => {
              setRestoring(true);
              await restoreEntry(entry.id);
              setRestoring(false);
              toast.success(t("trash.restored"));
            }}
          >
            <ArchiveRestore className="size-4" />
            {t("trash.restore")}
          </Button>
        </div>
      )}
      <DocumentReview
        key={entry.id}
        initial={entry.doc}
        photoUrl={photoUrl}
        companyTaxId={company.taxId}
        others={others}
        isDraft={entry.status === "draft"}
        onSave={async (d) => {
          const wasDraft = entry.status === "draft";
          await saveEntry(d, null, entry.id, "final", company.taxId);
          toast.success(t("trash.saved"));
          if (wasDraft) router.push("/ledger");
        }}
        onDraft={
          entry.status === "draft"
            ? async (d) => {
                await saveEntry(d, null, entry.id, "draft", company.taxId);
                toast.success(t("archive.drafted"));
              }
            : undefined
        }
        onDelete={
          entry.deletedAt && !deleting
            ? undefined
            : async (reason) => {
                setDeleting(true);
                await softDelete(entry.id, reason);
              }
        }
        onDeleted={() => {
          toast.success(t("del.done"));
          router.push("/ledger");
        }}
        onClose={() => router.push("/ledger")}
      />
      <div className="print:hidden lg:ml-[calc(360px+2rem)]">
        <ActivityList key={entry.updatedAt} documentId={entry.id} limit={20} title={t("dash.history")} />
      </div>
    </div>
  );
}
