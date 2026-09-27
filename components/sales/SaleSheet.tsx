"use client";

// One day of one channel: check what the AI read from the closing report (or type it in), then save.
// Saving a day and channel that already exist replaces them (a re-shot report corrects, never double-counts).

import { Calculator, FileText, Loader2, Save, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isMonthLocked } from "@/lib/month-lock-store";
import { useMe } from "@/lib/role-store";
import { CHANNELS, type Sale, saleVatOk, vatInsideSales } from "@/lib/sales";
import { deleteSale, saveSale } from "@/lib/sales-store";
import { cn } from "@/lib/utils";

export type SaleDraft = Omit<Sale, "id" | "photoPath"> & { id?: string; photoPath?: string | null };

export function SaleSheet({
  draft,
  photo,
  preview,
  unclear = [],
  existing,
  onClose,
}: {
  draft: SaleDraft;
  /** A newly read closing report to store with the day */
  photo?: File | null;
  /** Picture to show next to the form (object URL or signed URL) */
  preview?: string | null;
  unclear?: string[];
  /** The same day and channel already in the books (a save replaces it) */
  existing?: Sale | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const isAdmin = useMe().role === "admin";
  const [s, setS] = useState<SaleDraft>(draft);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const set = <K extends keyof SaleDraft>(k: K, v: SaleDraft[K]) => setS((x) => ({ ...x, [k]: v }));
  const un = new Set(unclear);
  const vatOk = saleVatOk(s);

  const save = async () => {
    if (!s.date) return toast.error(t("sales.needDate"));
    setBusy("save");
    try {
      await saveSale({ ...s, id: existing && !s.id ? existing.id : s.id }, photo);
      toast.success(t("sales.saved"));
      onClose();
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("lock.blocked") : t("app.saveFail"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!s.id) return;
    setBusy("delete");
    try {
      await deleteSale(s.id);
      toast.success(t("sales.deleted"));
      onClose();
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("lock.blocked") : t("app.saveFail"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-3xl" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle>{s.id ? t("sales.editTitle") : t("sales.newTitle")}</DialogTitle>
          <DialogDescription>{t("sales.sheetHint")}</DialogDescription>
        </DialogHeader>

        <div className={cn("grid gap-5", preview && "md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]")}>
          {preview && (
            <div className="overflow-hidden rounded-2xl bg-muted">
              {photo?.type === "application/pdf" ? (
                <div className="grid aspect-[3/4] place-items-center text-muted-foreground">
                  <FileText className="size-10" aria-hidden />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- object / signed URL
                <img src={preview} alt="" className="max-h-[60dvh] w-full object-contain" />
              )}
            </div>
          )}

          <div className="grid content-start gap-4 text-sm">
            {existing && !s.id && (
              <p className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-xs text-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 flex-none text-brand" aria-hidden />
                {t("sales.replaces")}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field on={un.has("date")} unsure={t("quick.unsure")} label={t("sales.date")}>
                <Input type="date" className="h-10" value={s.date} onChange={(e) => set("date", e.target.value)} />
              </Field>
              <Field on={un.has("bills")} unsure={t("quick.unsure")} label={t("sales.bills")}>
                <Input type="number" inputMode="numeric" min={0} className="h-10" value={s.bills || ""} onChange={(e) => set("bills", Number(e.target.value) || 0)} />
              </Field>
            </div>

            <div className="grid gap-2" role="group" aria-label={t("sales.channel")}>
              <span className="text-xs text-muted-foreground">{t("sales.channel")}</span>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={s.channel === c}
                    onClick={() => set("channel", c)}
                    className={cn(
                      "press h-9 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-foreground/10",
                      s.channel === c ? "bg-primary text-primary-foreground ring-primary" : "bg-background hover:bg-muted",
                    )}
                  >
                    {t(`sales.ch.${c}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field on={un.has("gross")} unsure={t("quick.unsure")} label={t("sales.gross")}>
                <MoneyInput className="h-10 text-[15px] font-semibold" value={s.gross} onChange={(v) => set("gross", Number(v) || 0)} />
              </Field>
              <Field on={un.has("vat")} unsure={t("quick.unsure")} label={t("sales.vat")}>
                <div className="flex gap-2">
                  <MoneyInput className="h-10 min-w-0 flex-1" value={s.vat} onChange={(v) => set("vat", Number(v) || 0)} />
                  <button
                    type="button"
                    onClick={() => set("vat", vatInsideSales(s.gross, s.exempt))}
                    className="press inline-flex h-10 flex-none items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-medium"
                  >
                    <Calculator className="size-4" aria-hidden />
                    {t("quick.vat7")}
                  </button>
                </div>
              </Field>
              <Field on={un.has("exempt")} unsure={t("quick.unsure")} label={t("sales.exempt")}>
                <MoneyInput className="h-10" value={s.exempt} onChange={(v) => set("exempt", Number(v) || 0)} />
              </Field>
              <Field on={un.has("docFrom")} unsure={t("quick.unsure")} label={t("sales.docRange")}>
                <div className="flex items-center gap-1.5">
                  <Input className="mono h-10 min-w-0" value={s.docFrom} onChange={(e) => set("docFrom", e.target.value)} aria-label={t("sales.docFrom")} />
                  <span className="text-muted-foreground">–</span>
                  <Input className="mono h-10 min-w-0" value={s.docTo} onChange={(e) => set("docTo", e.target.value)} aria-label={t("sales.docTo")} />
                </div>
              </Field>
            </div>
            {!vatOk && s.gross > 0 && (
              <p className="text-xs text-warn">{t("sales.vatOff", { calc: vatInsideSales(s.gross, s.exempt).toFixed(2) })}</p>
            )}
            <Field on={un.has("note")} unsure={t("quick.unsure")} label={t("sales.note")}>
              <Input className="h-10" value={s.note} onChange={(e) => set("note", e.target.value)} />
            </Field>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button type="button" className="h-11 rounded-full px-6" onClick={() => void save()} disabled={!!busy}>
                {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t("sales.save")}
              </Button>
              <Button type="button" variant="ghost" className="h-11 rounded-full px-4" onClick={onClose} disabled={!!busy}>
                {t("app.close")}
              </Button>
              {s.id && isAdmin && (
                <Button type="button" variant="ghost" className="ml-auto h-11 rounded-full px-4 text-bad" onClick={() => void remove()} disabled={!!busy}>
                  {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  {t("sales.delete")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled field; marked when the AI was unsure about it. Module level so inputs keep focus while typing. */
function Field({ on, unsure, label, children }: { on: boolean; unsure: string; label: string; children: React.ReactNode }) {
  return (
    <label className={cn("grid min-w-0 content-start gap-1.5 rounded-xl", on && "-m-2 bg-warn-soft p-2")}>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {label}
        {on && <span className="font-semibold text-warn">{unsure}</span>}
      </span>
      {children}
    </label>
  );
}
