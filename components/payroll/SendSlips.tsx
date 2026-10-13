"use client";

// Payslips out (admins): to the employees linked on LINE in one go (app/api/payroll/slips), or as a PDF through the
// print page for the rest.

import { FileDown, Loader2, MessageCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import type { Employee } from "@/lib/payroll";

type Result = { sent: string[]; notLinked: string[]; noPay: string[]; failed: string[] };

export function SendSlipsButton({ month, staff }: { month: string; staff: Employee[] }) {
  const t = useTranslations("pay.slips");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const linked = staff.filter((e) => e.lineUserId);

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/payroll/slips", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month, employeeIds: staff.map((e) => e.id) }) });
      const json = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok) {
        toast.error(json.error === "rate" ? t("rate") : t("fail"));
        return;
      }
      const r: Result = { sent: json.sent ?? [], notLinked: json.notLinked ?? [], noPay: json.noPay ?? [], failed: json.failed ?? [] };
      setResult(r);
      if (r.sent.length) toast.success(t("sentN", { count: r.sent.length }));
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  const names = (list: string[]) => list.join(", ");
  return (
    <>
      <Button type="button" variant="outline" className="h-10 rounded-full px-4 pointer-fine:h-9" onClick={() => (setResult(null), setOpen(true))}>
        <Send className="size-4" />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription className="text-xs">{t("hint")}</DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="grid gap-2 text-sm">
              {result.sent.length > 0 && <p className="rounded-xl bg-ok-soft px-3 py-2 text-ok">{t("sentList", { count: result.sent.length })}: {names(result.sent)}</p>}
              {result.notLinked.length > 0 && <p className="rounded-xl bg-warn-soft px-3 py-2 text-warn">{t("notLinkedList")}: {names(result.notLinked)}</p>}
              {result.noPay.length > 0 && <p className="rounded-xl bg-muted px-3 py-2 text-muted-foreground">{t("noPayList")}: {names(result.noPay)}</p>}
              {result.failed.length > 0 && <p className="rounded-xl bg-bad-soft px-3 py-2 text-bad">{t("failedList")}: {names(result.failed)}</p>}
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
              <MessageCircle className="size-4 flex-none text-[#05a847]" aria-hidden />
              {t("linkedCount", { linked: linked.length, all: staff.length })}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline" className="h-10 rounded-full">
              <Link href={`/payroll/print/slip/${month}?print=1`}>
                <FileDown className="size-4" />
                {t("pdf")}
              </Link>
            </Button>
            {!result && (
              <Button type="button" className="h-10 rounded-full" disabled={busy || !linked.length} onClick={() => void send()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {t("send", { count: linked.length })}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
