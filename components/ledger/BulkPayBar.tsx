"use client";

import { CircleCheck, Loader2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
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
import { joinTri } from "@/lib/form-labels";
import { type LedgerEntry, setPaidMany } from "@/lib/ledger-store";
import { baht, fromSatang, toSatang } from "@/lib/money";
import { todayBangkok } from "@/lib/thai-tax";
import { useDocName } from "./doc-name";
import { DateInput } from "@/components/ui/date-input";

/**
 * Payment run: the chosen unpaid documents, their total, and one button to mark them all paid. The confirm
 * step lists what to transfer per vendor (a small transfer list) and asks for the payment date.
 */
export function BulkPayBar({ chosen, onDone }: { chosen: LedgerEntry[]; onDone: () => void }) {
  const t = useTranslations("bulk");
  const docName = useDocName();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(todayBangkok);

  const total = fromSatang(chosen.reduce((a, e) => a + toSatang(e.doc.totals.net), 0));
  // One line per vendor (by tax ID, else by name), largest first
  const perVendor = useMemo(() => {
    const map = new Map<string, { name: string; count: number; sum: number }>();
    for (const e of chosen) {
      const name = joinTri(e.doc.seller.name, "en") || joinTri(e.doc.seller.name, "th") || docName(e.doc);
      const key = e.doc.seller.taxId || name;
      const v = map.get(key) ?? { name, count: 0, sum: 0 };
      map.set(key, { name: v.name, count: v.count + 1, sum: v.sum + toSatang(e.doc.totals.net) });
    }
    return [...map.values()].sort((a, b) => b.sum - a.sum);
  }, [chosen, docName]);

  const pay = async () => {
    const ids = chosen.map((e) => e.id);
    setBusy(true);
    try {
      await setPaidMany(ids, true, date);
      setOpen(false);
      onDone();
      toast.success(t("done", { count: ids.length }), {
        action: {
          label: <Undo2 className="size-4" aria-label="Undo" />,
          onClick: () => void setPaidMany(ids, false, "").catch(() => toast.error(t("fail"))),
        },
      });
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  if (!chosen.length) return null;

  return (
    <>
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center justify-between gap-3 rounded-full border bg-[var(--glass)] py-2 pr-2 pl-5 shadow-[var(--shadow-lift)] backdrop-blur-xl md:bottom-4">
        <p className="text-sm">
          <span className="font-semibold">{t("selected", { count: chosen.length })}</span>
          <span className="ml-2 font-semibold tabular-nums">{baht(total)}</span>
        </p>
        <Button type="button" className="h-10 rounded-full px-4" onClick={() => setOpen(true)}>
          <CircleCheck className="size-4" />
          {t("markPaid")}
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle", { count: chosen.length })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <ul className="grid max-h-60 gap-1 overflow-y-auto rounded-2xl bg-muted/60 p-3 text-sm">
              {perVendor.map((v) => (
                <li key={v.name} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {v.name} <span className="text-xs text-muted-foreground">({t("docs", { count: v.count })})</span>
                  </span>
                  <span className="font-semibold tabular-nums">{baht(fromSatang(v.sum))}</span>
                </li>
              ))}
              <li className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2 font-semibold">
                <span>{t("total")}</span>
                <span className="tabular-nums">{baht(total)}</span>
              </li>
            </ul>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{t("date")}</span>
              <DateInput value={date} max={todayBangkok()} onChange={(e) => setDate(e.target.value)} wrapClassName="w-40" className="h-10 rounded-xl" />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">{t("cancel")}</AlertDialogCancel>
            <Button type="button" className="rounded-full" disabled={busy || !date} onClick={() => void pay()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />}
              {t("markPaid")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
