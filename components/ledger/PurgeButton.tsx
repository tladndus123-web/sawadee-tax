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
import { purgeMany } from "@/lib/ledger-store";
import { cn } from "@/lib/utils";

/** Typed to confirm, the same in every language (owner's choice) */
const WORD = "delete";

/**
 * Admin, trash only: delete one or several documents for good. The person types "delete" first; the database
 * still refuses saved documents of a closed month (they are skipped and counted) and keeps a record of each.
 */
export function PurgeButton({ ids, name, onDone, className }: { ids: string[]; name?: string; onDone?: () => void; className?: string }) {
  const t = useTranslations("purge");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const purge = async () => {
    setBusy(true);
    try {
      const r = await purgeMany(ids);
      setOpen(false);
      if (r.done) toast.success(t("doneMany", { count: r.done }));
      if (r.locked) toast.warning(t("lockedSome", { count: r.locked }));
      if (r.failed) toast.error(t("fail"));
      onDone?.();
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        disabled={!ids.length}
        className={cn("h-10 rounded-full px-3 text-bad hover:bg-bad-soft hover:text-bad", className)}
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
            <AlertDialogTitle>{ids.length > 1 ? t("titleMany", { count: ids.length }) : t("title")}</AlertDialogTitle>
            <AlertDialogDescription>{ids.length > 1 ? t("descMany", { count: ids.length }) : t("desc", { name: name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="grid gap-2 text-sm">
            <span>{t("typeToConfirm", { word: WORD })}</span>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={WORD}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              lang="en"
              className="h-11 font-mono"
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">{t("cancel")}</AlertDialogCancel>
            <Button type="button" variant="destructive" className="rounded-full" disabled={busy || typed.trim().toLowerCase() !== WORD} onClick={() => void purge()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {t("confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
