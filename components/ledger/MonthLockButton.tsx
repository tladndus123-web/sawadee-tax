"use client";

import { Loader2, Lock, LockOpen } from "lucide-react";
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
import { closeMonth, reopenMonth } from "@/lib/month-lock-store";

/** Admin: close a filed tax month (asks first), or reopen it */
export function MonthLockButton({ month, label, locked, note, primary }: { month: string; label: string; locked: boolean; note?: string; primary?: boolean }) {
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
