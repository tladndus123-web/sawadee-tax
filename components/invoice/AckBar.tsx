"use client";

// "문제 없음" on the document screen: the warnings still open can be marked fine (the "확인 필요" alert goes away),
// and a marking can be taken back. Only the warning goes — whether the VAT can be claimed does not change.

import { CircleCheck, Loader2, RotateCcw, UserCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CheckResult } from "@/lib/checks";

export function AckBar({
  results,
  ack,
}: {
  results: CheckResult[];
  ack: { flags: string[]; by: string | null; at: number | null; onSet: (flags: string[]) => Promise<void> };
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const failing = results.filter((r) => !r.ok && !r.na && r.key !== "unclear").map((r) => r.key as string);
  const open = failing.filter((k) => !ack.flags.includes(k));
  if (!failing.length && !ack.flags.length) return null;

  const set = async (flags: string[], msg: string) => {
    setBusy(true);
    try {
      await ack.onSet(flags);
      toast.success(msg);
    } catch {
      toast.error(t("app.saveFail"));
    } finally {
      setBusy(false);
    }
  };

  if (open.length) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm print:hidden">
        <span className="min-w-0 flex-1">{t("ack.open", { count: open.length })}</span>
        <Button type="button" variant="secondary" className="h-9 rounded-full px-4" disabled={busy} onClick={() => void set([...ack.flags, ...open], t("ack.done"))}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4 text-ok" />}
          {t("ack.button")}
        </Button>
        <span className="w-full text-[11px] text-muted-foreground">{t("ack.hint")}</span>
      </div>
    );
  }

  const when = ack.at ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(ack.at) : "";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-sm print:hidden">
      <UserCheck className="size-4 flex-none text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">{t("ack.marked", { who: ack.by ?? t("ack.someone"), when })}</span>
      <Button type="button" variant="ghost" className="h-9 rounded-full px-3" disabled={busy} onClick={() => void set([], t("ack.back"))}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        {t("ack.back")}
      </Button>
    </div>
  );
}
