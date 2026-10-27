"use client";

// One claim in full (owner, 2026-10-27: "경비에선 이게 무슨 사진이고 뭘 샀는지 모르니까"): the receipt photo (tap to see it
// whole), what was bought line by line from the reading, the shop, day, note, and — for a claim moved over from the
// ledger or already paid back — a link to that ledger document.

import { ChevronRight, ImageOff, Loader2, Receipt } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCategoryLabel } from "@/components/vendors/CategoryIcon";
import { Link } from "@/i18n/navigation";
import { claimPhotoUrl } from "@/lib/expense-store";
import type { Claim } from "@/lib/expenses";
import { baht, fromSatang } from "@/lib/money";
import type { LedgerDoc } from "@/lib/types";

type Tri = { th: string; en: string; ja: string };
const pick = (t: Tri | undefined, locale: string) => (t ? (locale === "th" ? t.th || t.en : locale === "ja" ? t.ja || t.en || t.th : t.en || t.th || t.ja) : "").trim();

/** "Cooking oil and 3 more" — the first thing bought, for the list row */
export function firstItem(doc: LedgerDoc | null, locale: string): { name: string; more: number } | null {
  const named = (doc?.items ?? []).map((i) => pick(i.desc, locale)).filter(Boolean);
  return named.length ? { name: named[0], more: named.length - 1 } : null;
}

export function ClaimDetail({ c, isAdmin, onClose }: { c: Claim; isAdmin: boolean; onClose: () => void }) {
  const t = useTranslations("expenses.detail");
  const locale = useLocale();
  const catLabel = useCategoryLabel();
  const [photo, setPhoto] = useState<string | null | undefined>(c.photoPath ? undefined : null);
  useEffect(() => {
    if (c.photoPath) void claimPhotoUrl(c.photoPath).then(setPhoto);
  }, [c.photoPath]);
  const items = (c.doc?.items ?? []).filter((i) => pick(i.desc, locale) || i.amount);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{c.seller || catLabel(c.category)}</DialogTitle>
          <DialogDescription>
            {c.name} · {c.day} · {catLabel(c.category)}
          </DialogDescription>
        </DialogHeader>

        {/* The receipt */}
        {photo === undefined ? (
          <div className="grid h-48 place-items-center rounded-2xl bg-muted">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : photo ? (
          <a href={photo} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-muted" title={t("openPhoto")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed link to the private photo */}
            <img src={photo} alt={t("photo")} className="max-h-[45dvh] w-full object-contain" />
          </a>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            <ImageOff className="size-4" aria-hidden />
            {t("noPhoto")}
          </p>
        )}

        {/* What was bought */}
        <section className="grid gap-1.5">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Receipt className="size-4 text-muted-foreground" aria-hidden />
            {t("items")}
          </h3>
          {items.length ? (
            <ul className="divide-y divide-border/60 rounded-2xl bg-muted/50 px-3">
              {items.map((i, k) => (
                <li key={k} className="flex items-baseline justify-between gap-3 py-2 text-[14px]">
                  <span className="min-w-0">
                    {pick(i.desc, locale) || "—"}
                    {i.qty > 1 && (
                      <span className="text-muted-foreground">
                        {" "}
                        × {i.qty}
                        {pick(i.unit, locale) ? ` ${pick(i.unit, locale)}` : ""}
                      </span>
                    )}
                  </span>
                  <b className="flex-none tabular-nums">{baht(i.amount)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t("noItems")}</p>
          )}
          <p className="flex justify-between px-1 pt-1 text-[15px] font-bold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{baht(fromSatang(c.amount))}</span>
          </p>
        </section>

        {c.note && (
          <p className="rounded-2xl bg-muted/50 px-3 py-2 text-[13.5px]">
            <span className="text-muted-foreground">{t("note")} · </span>
            {c.note}
          </p>
        )}

        {isAdmin && c.documentId && (
          <Button asChild variant="secondary" className="h-11 rounded-full">
            <Link href={`/documents/${c.documentId}`}>
              {t("ledger")}
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
