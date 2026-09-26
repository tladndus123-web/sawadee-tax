"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { purgeEntry } from "@/lib/ledger-store";
import { isMonthLocked } from "@/lib/month-lock-store";

/**
 * Admin, trash only: delete a document for good. The person types the confirm word first; the database still
 * refuses a saved document of a closed month and keeps a short record of what was deleted.
 */
export function PurgeButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("purge");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const word = t("word");

  const purge = async () => {
    setBusy(true);
    try {
      await purgeEntry(id);
      setOpen(false);
      toast.success(t("done"));
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-10 rounded-full px-3 text-bad hover:bg-bad-soft hover:text-bad"
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
      >
        <Trash2 className="size-4" />
        <span className="max-sm:sr-only">{t("button")}</span>
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("desc", { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="grid gap-2 text-sm">
            <span>{t("typeToConfirm", { word })}</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={word} autoComplete="off" className="h-11" />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">{t("cancel")}</AlertDialogCancel>
            <Button type="button" variant="destructive" className="rounded-full" disabled={busy || typed.trim() !== word} onClick={() => void purge()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {t("confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
