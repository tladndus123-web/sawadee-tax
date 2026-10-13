"use client";

// One employee's LINE link (admins): linked or not, a one-time code for them to send the bot, and unlinking.
// The link is only used to send their payslip (app/api/payroll/slips).

import { Loader2, MessageCircle, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Employee } from "@/lib/payroll";
import { employeeLineCode, unlinkEmployeeLine } from "@/lib/payroll-store";
import { cn } from "@/lib/utils";

const BOT_ID = process.env.NEXT_PUBLIC_LINE_BOT_ID;

export function EmployeeLineButton({ e }: { e: Employee }) {
  const t = useTranslations("pay.line");
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linked = !!e.lineUserId;

  const getCode = async () => {
    setBusy(true);
    try {
      setCode(await employeeLineCode(e.id));
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    setBusy(true);
    try {
      await unlinkEmployeeLine(e.id);
      toast.success(t("unlinked"));
      setOpen(false);
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
        size="icon"
        className={cn("size-9 flex-none", linked ? "text-[#05a847]" : "text-muted-foreground")}
        aria-label={t(linked ? "linked" : "notLinked")}
        title={t(linked ? "linked" : "notLinked")}
        onClick={() => (setCode(null), setOpen(true))}
      >
        <MessageCircle className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title", { name: e.name })}</DialogTitle>
            <DialogDescription className="text-xs">{t("hint")}</DialogDescription>
          </DialogHeader>
          {linked ? (
            <div className="grid gap-3">
              <p className="flex items-center gap-2 rounded-2xl bg-[#06c755]/12 px-4 py-3 text-sm font-medium text-[#05a847]">
                <MessageCircle className="size-4" aria-hidden />
                {t("linked")}
              </p>
              <Button type="button" variant="outline" className="h-10 w-fit rounded-full" disabled={busy} onClick={() => void unlink()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Unlink className="size-4" />}
                {t("unlink")}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              <ol className="grid list-decimal gap-1 pl-5 text-sm leading-relaxed">
                <li>
                  {t("step1", { bot: BOT_ID ? ` (${BOT_ID})` : "" })}
                  {BOT_ID && (
                    <a href={`https://line.me/R/ti/p/${encodeURIComponent(BOT_ID)}`} target="_blank" rel="noreferrer" className="ml-1.5 font-medium text-primary hover:underline">
                      line.me/R/ti/p/{BOT_ID}
                    </a>
                  )}
                </li>
                <li>{t("step2")}</li>
                <li>{t("step3")}</li>
              </ol>
              {code ? (
                <div className="grid justify-items-center gap-1 rounded-2xl bg-muted px-4 py-4">
                  <span className="mono text-4xl font-bold tracking-[0.3em]">{code}</span>
                  <span className="text-xs text-muted-foreground">{t("codeHint")}</span>
                </div>
              ) : (
                <Button type="button" className="h-11 rounded-full" disabled={busy} onClick={() => void getCode()}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {t("getCode")}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
