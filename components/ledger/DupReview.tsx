"use client";

// The "중복 의심" chip opens this (owner 2026-11-08: "중복 목록 확인 후 여러 개 선택해서 삭제"): each group of documents with
// the same seller and number side by side, the later identical ones already ticked, and one button that moves the
// ticked ones to the trash (restorable). Admins only; the first saved document of a group is never pre-ticked.

import { Check, ExternalLink, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useScreenDate } from "@/components/ScreenDate";
import { Link } from "@/i18n/navigation";
import { dupGroups, likelyCopies } from "@/lib/dup-groups";
import { type LedgerEntry, softDeleteMany, usePhotoUrl } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { cn } from "@/lib/utils";

function Thumb({ path }: { path: string | null }) {
  const url = usePhotoUrl(path, "thumb");
  return (
    <span className="block size-14 flex-none overflow-hidden rounded-xl bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL of a private photo */}
      {url && <img src={url} alt="" loading="lazy" className="size-full object-cover" />}
    </span>
  );
}

const savedAt = (ms: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms));

export function DupReview({ entries }: { entries: LedgerEntry[] }) {
  const t = useTranslations("dupReview");
  const sd = useScreenDate();
  const groups = useMemo(
    () =>
      dupGroups(
        entries.map((e) => ({ id: e.id, sellerTaxId: e.doc.seller.taxId, docNo: e.doc.docNo, date: e.doc.date, total: e.doc.totals.net, createdAt: e.createdAt, entry: e })),
      ),
    [entries],
  );
  const [picked, setPicked] = useState<Set<string>>(() => new Set(likelyCopies(groups)));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only ids still on screen count (a moved one leaves the list)
  const live = new Set(groups.flatMap((g) => g.items.map((x) => x.id)));
  const chosen = [...picked].filter((id) => live.has(id));
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const go = async () => {
    setBusy(true);
    try {
      const n = await softDeleteMany(chosen, t("reason"));
      toast.success(t("done", { count: n }));
      setPicked(new Set());
      setAsking(false);
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  if (!groups.length) return <p className="rounded-2xl bg-muted/50 px-4 py-8 text-center text-[14px] text-muted-foreground">{t("none")}</p>;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 rounded-2xl bg-bad-soft px-4 py-3">
        <p className="text-[15px] font-semibold text-bad">{t("title", { groups: groups.length })}</p>
        <p className="text-[13px] text-foreground/80">{t("intro")}</p>
      </div>

      <ul className="grid gap-3">
        {groups.map((g) => (
          <li key={g.key} className="workspace-panel grid gap-2 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-[14px] font-semibold">
                {g.items[0].entry.doc.seller.name.en || g.items[0].entry.doc.seller.name.th || g.items[0].entry.doc.seller.name.ja} · <span className="font-mono text-[13px]">{g.items[0].docNo}</span>
              </span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", g.identical ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>{g.identical ? t("identical") : t("differs")}</span>
            </div>
            <ul className="grid gap-1.5">
              {g.items.map((x, i) => {
                const on = picked.has(x.id);
                return (
                  <li key={x.id}>
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors", on ? "bg-bad-soft/70" : "hover:bg-muted/60")}>
                      <input type="checkbox" className="size-5 flex-none accent-[var(--bad)]" checked={on} onChange={() => toggle(x.id)} aria-label={t("pick")} />
                      <Thumb path={x.entry.photoPath} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                          <span className="font-semibold tabular-nums">{baht(x.total)}</span>
                          <span className="text-muted-foreground">{sd(x.date)}</span>
                          {i === 0 && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">{t("first")}</span>}
                        </span>
                        <span className="text-[12px] text-muted-foreground tabular-nums">{t("saved", { at: savedAt(x.createdAt) })}</span>
                      </span>
                      <Link href={`/documents/${x.id}`} onClick={(e) => e.stopPropagation()} className="flex-none rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-primary" aria-label={t("open")}>
                        <ExternalLink className="size-4" aria-hidden />
                      </Link>
                    </label>
                  </li>
                );
              })}
            </ul>
            {!g.identical && (
              <p className="flex items-start gap-1.5 px-1 text-[12.5px] text-warn">
                <TriangleAlert className="mt-0.5 size-3.5 flex-none" aria-hidden />
                {t("differsHint")}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* The action bar stays at the bottom of the screen while scrolling */}
      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-10 md:bottom-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.12),0_0_0_1px_var(--border)]">
          {!asking ? (
            <>
              <span className="text-[14px] font-medium tabular-nums">{t("chosen", { count: chosen.length })}</span>
              <span className="flex flex-wrap gap-2">
                {chosen.length > 0 && (
                  <button type="button" onClick={() => setPicked(new Set())} className="press inline-flex h-10 items-center rounded-full px-3.5 text-[13px] font-medium text-muted-foreground hover:bg-muted">
                    {t("clear")}
                  </button>
                )}
                <button type="button" disabled={!chosen.length} onClick={() => setAsking(true)} className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-bad px-4 text-[14px] font-medium text-white hover:bg-bad/90 disabled:opacity-40">
                  <Trash2 className="size-4" aria-hidden />
                  {t("move", { count: chosen.length })}
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="text-[13.5px]">{t("sure", { count: chosen.length })}</span>
              <span className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => setAsking(false)} className="press inline-flex h-10 items-center rounded-full bg-secondary px-4 text-[14px] font-medium hover:bg-muted">
                  {t("cancel")}
                </button>
                <button type="button" disabled={busy} onClick={() => void go()} className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-bad px-4 text-[14px] font-medium text-white hover:bg-bad/90 disabled:opacity-60">
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                  {t("yes")}
                </button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
