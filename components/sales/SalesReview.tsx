"use client";

// Several closing reports at once (owner, 2026-10-09): every photo is read, each gives one or more lines (a day and a
// channel), and they are checked together here — date, channel, sales and VAT editable — then saved in one go.
// A line for a day and channel already in the books replaces it, like the single sheet.

import { Check, FileText, Loader2, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BranchPicker } from "@/components/invoice/BranchPicker";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { baht, fromSatang, toSatang } from "@/lib/money";
import { isMonthLocked } from "@/lib/month-lock-store";
import { CHANNELS, type Channel, type Sale, saleVatOk } from "@/lib/sales";
import { saveSale } from "@/lib/sales-store";
import { cn } from "@/lib/utils";
import { useChannelLabel } from "./channel-name";
import type { SaleDraft } from "./SaleSheet";

export type ReadPhoto = {
  name: string;
  /** The prepared picture (stored with each of its lines) */
  file: File | null;
  preview: string | null;
  /** What was read, or why not */
  lines: (SaleDraft & { unclear: string[] })[];
  error?: string;
};

type Row = SaleDraft & { key: string; photo: number; unclear: string[]; on: boolean };

export function SalesReview({ photos, branchId, existing, onClose }: { photos: ReadPhoto[]; branchId: string; existing: Sale[]; onClose: () => void }) {
  const t = useTranslations();
  const chName = useChannelLabel();
  const [branch, setBranch] = useState(branchId);
  const [rows, setRows] = useState<Row[]>(() => photos.flatMap((p, i) => p.lines.map((l, j) => ({ ...l, key: `${i}-${j}`, photo: i, on: true }))));
  const [busy, setBusy] = useState(false);
  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const sameAs = (r: Row) => existing.find((x) => x.date === r.date && x.channel === r.channel && (x.branchId || "") === (branch || "")) ?? null;
  // Two lines for the same day and channel would overwrite each other
  const twice = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) if (r.on) seen.set(`${r.date}|${r.channel}`, (seen.get(`${r.date}|${r.channel}`) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [rows]);
  const picked = rows.filter((r) => r.on);
  // A missing date or a doubled line blocks saving; VAT off by more than ฿1 is only shown (the single sheet allows it too)
  const bad = picked.filter((r) => !r.date || twice.has(`${r.date}|${r.channel}`));
  const total = fromSatang(picked.reduce((a, r) => a + toSatang(r.gross), 0));

  const save = async () => {
    setBusy(true);
    let saved = 0;
    let locked = 0;
    let failed = 0;
    for (const r of picked) {
      const old = sameAs(r);
      const draft: SaleDraft = { branchId: branch, date: r.date, channel: r.channel, docFrom: r.docFrom, docTo: r.docTo, bills: r.bills, gross: r.gross, vat: r.vat, exempt: r.exempt, note: r.note, source: "photo" };
      try {
        await saveSale({ ...draft, id: old?.id }, photos[r.photo].file);
        saved++;
        setRows((rs) => rs.filter((x) => x.key !== r.key));
      } catch (e) {
        if (isMonthLocked(e)) locked++;
        else failed++;
      }
    }
    setBusy(false);
    if (saved) toast.success(t("sales.batch.saved", { count: saved }));
    if (locked) toast.error(t("sales.batch.locked", { count: locked }));
    if (failed) toast.error(t("sales.batch.failed", { count: failed }));
    if (!locked && !failed) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-3xl" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle>{t("sales.batch.title", { count: rows.length })}</DialogTitle>
          <DialogDescription>{t("sales.batch.hint")}</DialogDescription>
        </DialogHeader>

        <BranchPicker value={branch} onChange={setBranch} />

        <div className="grid gap-4">
          {photos.map((p, i) => {
            const mine = rows.filter((r) => r.photo === i);
            if (!mine.length && !p.error) return null;
            return (
              <section key={i} className="grid gap-2 rounded-2xl bg-muted/40 p-3 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3">
                <div className="flex items-center gap-2 sm:grid sm:content-start">
                  <span className="grid size-14 flex-none place-items-center overflow-hidden rounded-xl bg-muted sm:size-20">
                    {p.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- object URL of the picked photo
                      <img src={p.preview} alt="" className="size-full object-cover" />
                    ) : (
                      <FileText className="size-6 text-muted-foreground" aria-hidden />
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground sm:hidden">{p.name}</span>
                </div>
                {p.error ? (
                  <p className="flex items-center gap-2 self-center text-sm text-bad">
                    <X className="size-4 flex-none" aria-hidden />
                    {p.error}
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {mine.map((r) => {
                      const un = new Set(r.unclear);
                      const dup = twice.has(`${r.date}|${r.channel}`) && r.on;
                      const old = sameAs(r);
                      return (
                        <li key={r.key} className={cn("grid gap-2 rounded-xl bg-card p-3 ring-1 ring-border", !r.on && "opacity-50")}>
                          <div className="grid grid-cols-[auto_minmax(0,1.25fr)_minmax(0,1fr)] items-center gap-2">
                            <Checkbox checked={r.on} onCheckedChange={(v) => set(r.key, { on: v === true })} aria-label={t("sales.batch.include")} className="size-5 rounded-md" />
                            <DateInput
                              value={r.date}
                              onChange={(e) => set(r.key, { date: e.target.value })}
                              className={cn("h-10", un.has("date") && "ring-2 ring-warn")}
                              aria-label={t("sales.date")}
                            />
                            <select
                              value={r.channel}
                              onChange={(e) => set(r.key, { channel: e.target.value as Channel })}
                              className="h-10 w-full min-w-0 rounded-[10px] border bg-card px-2.5 text-sm"
                              aria-label={t("sales.channel")}
                            >
                              {CHANNELS.map((c) => (
                                <option key={c} value={c}>
                                  {chName(c)}
                                </option>
                              ))}
                            </select>
                          </div>
                          {old && <span className="w-fit rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{t("sales.batch.replaces")}</span>}
                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1">
                              <span className="text-xs text-muted-foreground">{t("sales.gross")}</span>
                              <MoneyInput className={cn("h-10 text-[15px] font-semibold", un.has("gross") && "ring-2 ring-warn")} value={r.gross} onChange={(v) => set(r.key, { gross: Number(v) || 0 })} />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-xs text-muted-foreground">{t("sales.vat")}</span>
                              <MoneyInput className={cn("h-10", un.has("vat") && "ring-2 ring-warn")} value={r.vat} onChange={(v) => set(r.key, { vat: Number(v) || 0 })} />
                            </label>
                          </div>
                          {(dup || r.unclear.length > 0 || !saleVatOk(r)) && (
                            <p className={cn("flex items-start gap-1.5 text-xs", dup || !saleVatOk(r) ? "text-bad" : "text-warn")}>
                              <TriangleAlert className="mt-0.5 size-3.5 flex-none" aria-hidden />
                              {dup ? t("sales.batch.twice") : !saleVatOk(r) ? t("sales.batch.vatOff") : t("sales.batch.check")}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center gap-3 border-t bg-card/95 px-6 py-3 backdrop-blur">
          <span className="text-sm">
            {t("sales.batch.picked", { count: picked.length })} · <b className="tabular-nums">{baht(total)}</b>
          </span>
          <span className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="button" className="rounded-full" disabled={busy || !picked.length || bad.length > 0} onClick={() => void save()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {t("sales.batch.save", { count: picked.length })}
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
