"use client";

import { Copy, Loader2, Lock, LockOpen } from "lucide-react";
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
import { Link } from "@/i18n/navigation";
import { closeMonth, reopenMonth } from "@/lib/month-lock-store";

/**
 * Admin: close a filed tax month (asks first), or reopen it. `dups` = possible duplicates with a document in the month
 * (lib/dup-groups dupGroupsIn): the dialog says so first and offers the review (owner 2026-11-08); closing stays possible.
 * `onDups` opens the review on the same screen (the ledger), else the button goes to /ledger?status=dup.
 */
export function MonthLockButton({ month, label, locked, note, primary, dups = 0, onDups }: { month: string; label: string; locked: boolean; note?: string; primary?: boolean; dups?: number; onDups?: () => void }) {
  const t = useTranslations("lock");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (close: boolean) => {
    setBusy(true);
    try {
      await (close ? closeMonth(month) : reopenMonth(month));
      toast.success(close ? t("closed", { month: label }) : t("reopened", { month: label }));
      setOpen(false);
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  if (locked)
    return (
      <Button type="button" variant="ghost" className="h-9 rounded-full px-3 text-muted-foreground" disabled={busy} onClick={() => void run(false)}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <LockOpen className="size-4" />}
        {t("reopen")}
      </Button>
    );

  return (
    <>
      <Button
        type="button"
        variant={primary ? "default" : "ghost"}
        className={primary ? "h-10 rounded-full px-4" : "h-9 rounded-full px-3 text-muted-foreground"}
        onClick={() => setOpen(true)}
      >
        <Lock className="size-4" />
        {t("close")}
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle", { month: label })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDesc")}</AlertDialogDescription>
            {dups > 0 && (
              <div className="grid gap-2 rounded-xl bg-bad-soft px-3 py-2.5">
                <p className="flex items-start gap-2 text-sm font-semibold text-bad">
                  <Copy className="mt-0.5 size-4 flex-none" aria-hidden />
                  {t("dups", { count: dups })}
                </p>
                <p className="text-[12.5px] text-foreground/80">{t("dupsWhy")}</p>
                {onDups ? (
                  <button type="button" onClick={() => (setOpen(false), onDups())} className="press inline-flex h-9 w-fit items-center rounded-full bg-bad px-3.5 text-[13px] font-medium text-white hover:bg-bad/90">
                    {t("dupsGo")} →
                  </button>
                ) : (
                  <Link href="/ledger?status=dup" className="press inline-flex h-9 w-fit items-center rounded-full bg-bad px-3.5 text-[13px] font-medium text-white hover:bg-bad/90">
                    {t("dupsGo")} →
                  </Link>
                )}
              </div>
            )}
            {note && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-medium text-warn">{note}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">{t("cancel")}</AlertDialogCancel>
            <Button type="button" className="rounded-full" disabled={busy} onClick={() => void run(true)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              {t("close")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
