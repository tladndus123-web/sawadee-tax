"use client";

// The office's in-tray (admins): documents saved by staff or the LINE bot that no admin has looked at yet. They are
// already in the books; checking only records that someone looked. One tap per document, or all at once.

import { Check, ChevronDown, CircleCheck, Loader2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useScreenDate } from "@/components/ScreenDate";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/vendors/CategoryIcon";
import { Link } from "@/i18n/navigation";
import { type LedgerEntry, pick, setChecked, useLedger } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";
import { useDocName } from "@/components/ledger/doc-name";

const SHOWN = 5;

export function UncheckedList() {
  const t = useTranslations("dash");
  const sd = useScreenDate();
  const me = useMe();
  const { entries } = useLedger();
  const items = useMemo(() => pick(entries, "ledger").filter((e) => e.checkedAt === null), [entries]);
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const check = async (ids: string[]) => {
    setBusy(ids.length === 1 ? ids[0] : "all");
    try {
      await setChecked(ids, true, me.name || me.email);
      toast.success(t("checkedDone", { count: ids.length }), {
        action: { label: <Undo2 className="size-4" aria-label={t("checkUndo")} />, onClick: () => void setChecked(ids, false, "") },
      });
    } catch {
      toast.error(t("checkFail"));
    } finally {
      setBusy(null);
    }
  };
  const docName = useDocName();
  const name = (e: LedgerEntry) => docName(e.doc);

  return (
    <section aria-labelledby="unchecked-title" className="workspace-panel hover-lift [--lift:1.006] grid gap-3 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="unchecked-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {t("unchecked")}
            {items.length > 0 && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand tabular-nums">{t("upcomingCount", { count: items.length })}</span>}
          </h2>
          <p className="text-xs text-muted-foreground">{t("uncheckedHint")}</p>
        </div>
        {items.length > 1 && (
          <Button type="button" variant="outline" className="h-8 flex-none rounded-full px-3 text-xs" disabled={busy !== null} onClick={() => void check(items.map((e) => e.id))}>
            {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t("checkAll", { count: items.length })}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-ok" aria-hidden />
          {t("uncheckedEmpty")}
        </p>
      ) : (
        <ul className="grid">
          {(all ? items : items.slice(0, SHOWN)).map((e) => (
            <li key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border/60 py-3 last:border-0">
              <CategoryIcon category={e.doc.category} className="row-span-2" />
              <Link href={`/documents/${e.id}`} className="truncate text-[15px] font-semibold hover:underline">
                {name(e)}
              </Link>
              <span className="text-right text-[15px] font-semibold tabular-nums">{baht(e.doc.totals.net)}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {e.doc.date && <span className="tabular-nums">{sd(e.doc.date)}</span>}
                {e.doc.docNo && <span className="mono truncate">{e.doc.docNo}</span>}
              </span>
              <Button type="button" variant="outline" className="h-8 flex-none rounded-full px-3 text-xs" disabled={busy !== null} onClick={() => void check([e.id])}>
                {busy === e.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t("checkOne")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {items.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="press flex h-10 items-center justify-center gap-1 rounded-full text-sm font-medium text-primary hover:bg-primary/10"
        >
          {all ? t("upcomingLess") : t("upcomingMore", { count: items.length - SHOWN })}
          <ChevronDown className={cn("size-4 transition-transform", all && "rotate-180")} aria-hidden />
        </button>
      )}
    </section>
  );
}
