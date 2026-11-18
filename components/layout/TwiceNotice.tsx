"use client";

// "중복 확인 부탁드립니다" (owner 2026-11-18: "딱 들어가자마자 중복 안내"): admins are asked once per visit, right after the
// branch gate, when something looks entered twice — ledger documents with the same seller and document number
// (lib/dup-groups, the 장부 "중복 의심" review) and sales reports in on two days (lib/sales-slips elsewherePairs).
// "지금 확인하러 가기" opens the ledger's duplicate review (tick, check, move to the trash at once — owner: "장부에서 한 번에
// 지울 수 있도록, 검수도"); a sales date opens that line. In each reader's own app language. Counted live, so once
// someone deletes them nobody is asked again. "나중에" / ✕ waits for the next visit; it never stacks on "what's new".

import { CopyX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { AppMark } from "@/components/layout/app-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { dupGroups, likelyCopies } from "@/lib/dup-groups";
import { pick, useLedger } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { elsewherePairs } from "@/lib/sales-slips";
import { useSales } from "@/lib/sales-store";
import { usePref } from "@/lib/user-prefs";

const ASKED = "sawadee.twice-asked";
/** The same key as components/layout/WhatsNew (seen = true) */
const NOTICE = "notice-2026-11-18";

export function TwiceNotice() {
  const me = useMe();
  return me.loaded && me.role === "admin" ? <Ask /> : null;
}

function Ask() {
  const t = useTranslations("twiceNotice");
  const router = useRouter();
  const { sales, loaded: salesLoaded } = useSales();
  const { entries, loaded: ledgerLoaded } = useLedger();
  const [noticeSeen] = usePref<boolean>(NOTICE, (v) => v === true, false);
  const pairs = useMemo(() => (salesLoaded ? elsewherePairs(sales) : []), [sales, salesLoaded]);
  // The ledger review's own groups (components/ledger/DupReview): same seller tax ID + document number
  const docs = useMemo(() => {
    if (!ledgerLoaded) return { groups: 0, copies: 0, extra: 0 };
    const saved = pick(entries, "ledger");
    const groups = dupGroups(saved.map((e) => ({ id: e.id, sellerTaxId: e.doc.seller.taxId, docNo: e.doc.docNo, date: e.doc.date, total: e.doc.totals.net, createdAt: e.createdAt })));
    const copies = new Set(likelyCopies(groups));
    const extra = groups.flatMap((g) => g.items).filter((x) => copies.has(x.id)).reduce((a, x) => a + x.total, 0);
    return { groups: groups.length, copies: copies.size, extra };
  }, [entries, ledgerLoaded]);
  const [asked, setAsked] = useState(true);
  // Stepped aside while things are being checked (asks again on the next visit)
  const [away, setAway] = useState(false);
  useEffect(() => {
    try {
      setAsked(sessionStorage.getItem(ASKED) === "1");
    } catch {
      setAsked(false);
    }
  }, []);
  const later = () => {
    try {
      sessionStorage.setItem(ASKED, "1");
    } catch {}
    setAsked(true);
  };
  if (asked || away || !noticeSeen || !salesLoaded || !ledgerLoaded || (!docs.groups && !pairs.length)) return null;
  const go = (href: string) => {
    setAway(true);
    router.push(href);
  };
  const salesExtra = pairs.reduce((a, p) => a + p.second.gross, 0);
  return (
    <Dialog open onOpenChange={(open) => !open && later()}>
      <DialogContent showCloseButton={false} className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 shadow-xl sm:max-w-[420px]">
        <div className="relative px-6 pt-6 pb-5">
          <DialogClose className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-fine:size-9" aria-label={t("later")}>
            <X className="size-[18px]" aria-hidden />
          </DialogClose>
          <AppMark className="size-10" />
          <p className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-bad">
            <CopyX className="size-4" aria-hidden />
            {t("badge")}
          </p>
          <DialogTitle className="mt-1 text-[21px] leading-tight font-semibold tracking-[-0.02em]">{t("title")}</DialogTitle>
          <DialogDescription className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{t("intro")}</DialogDescription>
        </div>

        <div className="min-h-0 divide-y divide-border/70 overflow-y-auto border-y border-border/70 px-6">
          {docs.groups > 0 && (
            <div className="grid gap-1 py-3.5">
              <p className="flex items-baseline justify-between gap-3 text-[14.5px] font-medium">
                {t("docs", { count: docs.groups })}
                {docs.extra > 0 && <span className="text-[13px] font-semibold text-bad tabular-nums">+{baht(docs.extra)}</span>}
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{t("docsHint", { count: docs.copies })}</p>
            </div>
          )}
          {pairs.length > 0 && (
            <div className="grid gap-2 py-3.5">
              <p className="flex items-baseline justify-between gap-3 text-[14.5px] font-medium">
                {t("sales", { count: pairs.length })}
                <span className="text-[13px] font-semibold text-bad tabular-nums">+{baht(salesExtra)}</span>
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{t("salesHint")}</p>
              {pairs.slice(0, 3).map(({ first, second }) => (
                <span key={`${first.id}|${second.id}`} className="flex flex-wrap items-center gap-2">
                  <b className="basis-full text-[13.5px] tabular-nums">{baht(second.gross)}</b>
                  {[first, second].map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => go(`/sales?open=${x.id}`)}
                      className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-medium tabular-nums hover:bg-muted/70 pointer-fine:h-8"
                    >
                      {x.date}
                      <span className="text-muted-foreground">{t("open")}</span>
                    </button>
                  ))}
                </span>
              ))}
              {pairs.length > 3 && <p className="text-[13px] text-muted-foreground">{t("more", { count: pairs.length - 3 })}</p>}
            </div>
          )}
        </div>

        <div className="grid gap-2 px-6 py-4">
          <Button type="button" className="h-11 w-full rounded-full text-[14.5px]" onClick={() => go(docs.groups ? "/ledger?status=dup" : `/sales?open=${pairs[0].second.id}`)}>
            {docs.groups ? t("goLedger") : t("go")}
          </Button>
          <Button type="button" variant="ghost" className="h-11 w-full rounded-full text-[14px] text-muted-foreground" onClick={later}>
            {t("later")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
