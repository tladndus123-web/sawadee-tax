"use client";

// "중복 안내 확인 부탁드립니다" (owner 2026-11-18/19): right after the branch gate, admins see the possible duplicates —
// ledger documents with the same seller and document number, sales reports in on two days — worked out on the server
// (/api/dups, lib/dup-notice), so this downloads a short list, not the books. Two answers:
//   "확인하기"  → the ledger's duplicate review (tick, check, trash at once) or the sales line; gone for this person only
//                (their checked keys live in their sign-in, lib/user-prefs), the others are still asked;
//   "문제없음"  → they are fine: kept for everyone (dup_acks), nobody is asked about them again.
// A new copy has a new key, so it is asked about again. ✕ waits for the next visit. In each reader's app language;
// never on top of the one-time "what's new" notice.

import { CopyX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AppMark } from "@/components/layout/app-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { type DupNotice, noticeKeys, notSeen } from "@/lib/dup-notice";
import { baht } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { usePref } from "@/lib/user-prefs";

const LATER = "sawadee.dups-later";
/** The same key as components/layout/WhatsNew (seen = true) */
const NOTICE = "notice-2026-11-18";
/** Keys this person checked ("확인하기"), newest last, at most 300 */
const SEEN = "dups-seen";
/** Wait this long after the page opens before asking the server (ms) */
const ASK_AFTER = 6000;

export function TwiceNotice() {
  const me = useMe();
  return me.loaded && me.role === "admin" ? <Ask /> : null;
}

function Ask() {
  const t = useTranslations("twiceNotice");
  const router = useRouter();
  const [noticeSeen] = usePref<boolean>(NOTICE, (v) => v === true, false);
  const [seen, setSeen] = usePref<string[]>(SEEN, (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []), []);
  const [list, setList] = useState<DupNotice | null>(null);
  const [closed, setClosed] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let later = false;
    try {
      later = sessionStorage.getItem(LATER) === "1";
    } catch {}
    if (later || !noticeSeen) return;
    let live = true;
    // After the screen has its own numbers (measured 2026-11-19: asked at once, it slowed the first dashboard visit
    // from 6 to 11 seconds by competing with it)
    const timer = window.setTimeout(() => {
      void fetch("/api/dups")
        .then((r) => (r.ok ? (r.json() as Promise<DupNotice>) : null))
        .then((n) => {
          if (!live || !n) return;
          setList(n);
          setClosed(false);
        })
        .catch(() => undefined);
    }, ASK_AFTER);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [noticeSeen]);
  if (closed || !list) return null;
  const shown = notSeen(list, new Set(seen));
  const keys = noticeKeys(shown);
  if (!keys.length) return null;

  const later = () => {
    try {
      sessionStorage.setItem(LATER, "1");
    } catch {}
    setClosed(true);
  };
  // "확인하기": gone for this person only
  const check = (href: string) => {
    setSeen([...seen.filter((k) => !keys.includes(k)), ...keys].slice(-300));
    setClosed(true);
    router.push(href);
  };
  // "문제없음": fine for everyone
  const fine = async () => {
    setBusy(true);
    try {
      await fetch("/api/dups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys }) });
    } catch {}
    setBusy(false);
    setClosed(true);
  };
  const docGroups = shown.docs.length;
  const docExtra = shown.docs.reduce((a, d) => a + d.extra, 0);
  const docCopies = shown.docs.reduce((a, d) => a + d.copies, 0);
  const salesExtra = shown.sales.reduce((a, p) => a + p.second.gross, 0);

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
          {docGroups > 0 && (
            <div className="grid gap-1 py-3.5">
              <p className="flex items-baseline justify-between gap-3 text-[14.5px] font-medium">
                {t("docs", { count: docGroups })}
                {docExtra > 0 && <span className="text-[13px] font-semibold text-bad tabular-nums">{t("extraAmount", { amount: baht(docExtra) })}</span>}
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{t("docsHint", { count: docCopies })}</p>
            </div>
          )}
          {shown.sales.length > 0 && (
            <div className="grid gap-2 py-3.5">
              <p className="flex items-baseline justify-between gap-3 text-[14.5px] font-medium">
                {t("sales", { count: shown.sales.length })}
                <span className="text-[13px] font-semibold text-bad tabular-nums">{t("extraAmount", { amount: baht(salesExtra) })}</span>
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{t("salesHint")}</p>
              {shown.sales.slice(0, 3).map(({ key, first, second }) => (
                <span key={key} className="flex flex-wrap items-center gap-2">
                  <b className="basis-full text-[13.5px] tabular-nums">{baht(second.gross)}</b>
                  {[first, second].map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => {
                        setClosed(true);
                        router.push(`/sales?open=${x.id}`);
                      }}
                      className="press inline-flex h-11 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-medium tabular-nums hover:bg-muted/70 pointer-fine:h-8"
                    >
                      {x.date}
                      <span className="text-muted-foreground">{t("open")}</span>
                    </button>
                  ))}
                </span>
              ))}
              {shown.sales.length > 3 && <p className="text-[13px] text-muted-foreground">{t("more", { count: shown.sales.length - 3 })}</p>}
            </div>
          )}
        </div>

        <div className="grid gap-2 px-6 py-4">
          <Button type="button" className="h-11 w-full rounded-full text-[14.5px]" onClick={() => check(docGroups ? "/ledger?status=dup" : `/sales?open=${shown.sales[0].second.id}`)}>
            {t("check")}
          </Button>
          <Button type="button" variant="outline" className="h-11 w-full rounded-full text-[14px]" disabled={busy} onClick={() => void fine()}>
            {t("fine")}
          </Button>
          <p className="text-center text-[12px] leading-relaxed text-muted-foreground">{t("answersHint")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
