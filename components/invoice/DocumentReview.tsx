"use client";

import dynamic from "next/dynamic";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, ChevronDown, Download, FileImage, FilePen, FileText, Loader2, Printer, Save, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { isMonthLocked } from "@/lib/month-lock-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type LedgerRef, runChecks } from "@/lib/checks";
import { docSchema } from "@/lib/doc-schema";
import { type FormMode, joinTri } from "@/lib/form-labels";
import { useMe } from "@/lib/role-store";
import { baht } from "@/lib/money";
import { dropEmptyItems, normalize } from "@/lib/normalize";
import { todayBangkok } from "@/lib/thai-tax";
import { applyTranslations, translationJobs } from "@/lib/translate-gaps";
import { type Box, CATEGORIES, type LedgerDoc, PAYMENTS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StickerDots, StickerPicker, useMonthLabel } from "@/components/ledger/Stickers";
import { monthKey } from "@/lib/archive";
import { ChecksPanel } from "./ChecksPanel";
import { DeleteFlow } from "./DeleteFlow";
import { Chip } from "./fields";
import { InvoiceEdit } from "./InvoiceEdit";
import { InvoiceView } from "./InvoiceView";
import { TaxFields } from "./TaxFields";
import { QuickCard } from "./QuickCard";
import { TranslateBadge } from "./TranslateBadge";
import { VendorPicker } from "./VendorPicker";

// The zoomable photo (react-zoom-pan-pinch) loads after the form is on screen
const PhotoViewer = dynamic(() => import("./PhotoViewer").then((m) => m.PhotoViewer), {
  ssr: false,
  loading: () => <div className="aspect-[3/4] max-h-[65dvh] animate-pulse rounded-2xl bg-muted/40" aria-hidden />,
});

const FORM_KEY = "trl.formMode";
/** "quick" = the quick card (default), "detail" = the whole paper form; remembered per browser */
const VIEW_KEY = "trl.reviewView";
type ReviewView = "quick" | "detail";
const FORM_MODES: [FormMode, string][] = [
  ["all", ""],
  ["th", "ไทย"],
  ["en", "EN"],
  ["ja", "日本語"],
];

export interface DocumentReviewProps {
  initial: LedgerDoc;
  photoUrl: string | null;
  isNew?: boolean;
  /** Saved as a draft: not in the ledger or monthly totals yet */
  isDraft?: boolean;
  isSample?: boolean;
  uploaderName?: string;
  companyTaxId?: string;
  others?: LedgerRef[];
  onSave: (doc: LedgerDoc) => Promise<void>;
  /** Soft delete with the admin's reason. Only admins see an active delete button. */
  onDelete?: (reason: string) => Promise<void>;
  /** After the shredder finishes (default: onClose) */
  onDeleted?: () => void;
  /** Short note shown under the title (e.g. what the vendor dictionary changed) */
  notice?: React.ReactNode;
  /** Save without validation to finish later */
  onDraft?: (doc: LedgerDoc) => Promise<void>;
  /** Text on the save button (default "save"), e.g. "confirm → next" while checking one by one */
  saveLabel?: string;
  /** Open in edit mode */
  startEditing?: boolean;
  /** Typed by hand, no photo: no photo column, and the seller's name / tax ID can be typed on the quick card */
  manual?: boolean;
  /** Download links of the stored picture and original PDF (saved documents) */
  downloads?: { photo: string | null; pdf: string | null };
  onClose: () => void;
}

/** Photo on the left, organized form on the right, checks and actions below. */
export function DocumentReview({
  initial,
  photoUrl,
  isNew,
  isDraft,
  isSample,
  uploaderName,
  companyTaxId,
  others,
  onSave,
  onDelete,
  onDeleted,
  onDraft,
  onClose,
  notice,
  saveLabel,
  startEditing = false,
  manual = false,
  downloads,
}: DocumentReviewProps) {
  const t = useTranslations();
  const form = useForm<LedgerDoc>({ defaultValues: initial, resolver: zodResolver(docSchema), mode: "onBlur" });
  const { control, handleSubmit, setValue, getValues } = form;
  const watched = useWatch({ control }) as LedgerDoc;
  const doc = useMemo(() => normalize({ ...watched, id: initial.id }), [watched, initial.id]);
  const results = useMemo(() => runChecks(doc, { companyTaxId, others }), [doc, companyTaxId, others]);

  const [editing, setEditing] = useState(startEditing);
  const [view, setView] = useState<ReviewView>(startEditing ? "detail" : "quick");
  const [mobilePanel, setMobilePanel] = useState<"form" | "photo">("form");
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("all");
  const [focus, setFocus] = useState<{ box: Box; nonce: number } | null>(null);
  const [busy, setBusy] = useState<"save" | "draft" | null>(null);
  const monthLabel = useMonthLabel();
  const me = useMe();

  // Mount the photo only when it has a visible, measurable viewport.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // Remember the form language per browser
  useEffect(() => {
    try {
      const v = localStorage.getItem(FORM_KEY) as FormMode | null;
      if (v && ["all", "th", "en", "ja"].includes(v)) setFormMode(v);
    } catch {}
  }, []);
  useEffect(() => {
    if (startEditing) return;
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "quick" || v === "detail") setView(v);
    } catch {}
  }, [startEditing]);
  const changeView = (v: string) => {
    if (v !== "quick" && v !== "detail") return;
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  const changeFormMode = (v: string) => {
    if (!v) return;
    setFormMode(v as FormMode);
    try {
      localStorage.setItem(FORM_KEY, v);
    } catch {}
  };

  const showField = (path: string) => {
    setMobilePanel("photo");
    const box = getValues("fieldBoxes")?.[path];
    if (box) setFocus({ box, nonce: Date.now() });
    else toast.info(t("photo.noBox"));
    requestAnimationFrame(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const panel = document.getElementById("photo-panel");
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "nearest" });
    });
  };

  // Fields changed in exactly one language get the other two from the AI; a failed translation never blocks saving
  const translated = async (d: LedgerDoc): Promise<LedgerDoc> => {
    const jobs = translationJobs(d, normalize(initial));
    if (!jobs.length) return d;
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: jobs.map(({ from, text, to }) => ({ from, text, to })) }),
      });
      const json = (await res.json().catch(() => ({}))) as { items?: Partial<Record<"th" | "en" | "ja", string>>[] };
      if (!res.ok || !json.items) throw new Error(String(res.status));
      toast.success(t("tr.done", { count: jobs.length }), { icon: "✨" });
      return applyTranslations(d, jobs, json.items);
    } catch {
      toast.warning(t("tr.failed"));
      return d;
    }
  };

  // Drafts skip validation: half-finished documents are the point
  const draft = async () => {
    if (!onDraft) return;
    setBusy("draft");
    try {
      await onDraft(await translated(dropEmptyItems(normalize({ ...getValues(), id: initial.id }))));
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("lock.blocked") : t("app.saveFail"));
    } finally {
      setBusy(null);
    }
  };

  const save = handleSubmit(
    async (d) => {
      setBusy("save");
      try {
        await onSave(await translated(dropEmptyItems(normalize({ ...d, id: initial.id }))));
      } catch (e) {
        toast.error(isMonthLocked(e) ? t("lock.blocked") : t("app.saveFail"));
      } finally {
        setBusy(null);
      }
    },
    () => toast.error(t("review.invalid")),
  );


  const paid = useWatch({ control, name: "paid" });

  return (
    <FormProvider {...form}>
      <form
        onSubmit={save}
        className={cn(
          "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 lg:gap-8 print:block",
          manual ? "mx-auto w-full max-w-3xl" : "lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]",
        )}
      >
        <header className={cn("flex min-w-0 flex-wrap items-start justify-between gap-5 print:hidden", !manual && "lg:col-span-2")}>
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-brand">
              <FileText className="size-4" aria-hidden />
              {isNew ? t("app.newTitle") : t("app.editTitle")}
              {isSample && <Chip>{t("app.ex")}</Chip>}
              {isDraft && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">{t("archive.draftBadge")}</span>}
            </p>
            <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              {monthLabel(monthKey(doc))}
            </p>
            <h2 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] [overflow-wrap:anywhere] sm:text-4xl">
              {doc.docNo || t("ui.documentForm")}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{t("ui.reviewHint")}</p>
            {notice && <div className="mt-3">{notice}</div>}
            {uploaderName && <p className="mt-2 text-xs text-muted-foreground">{t("app.uploadedBy")}: {uploaderName}</p>}
          </div>
          <div className="ai-ring min-w-0 rounded-2xl px-5 py-3.5 max-sm:w-full sm:text-right">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t("labels.net")}</p>
            <p className="text-[26px] leading-tight font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]">{baht(doc.totals.net)}</p>
          </div>
        </header>

        {!manual && <>
        <div className="sticky top-16 z-30 -mx-1 min-w-0 rounded-[14px] bg-background/80 p-1 backdrop-blur-xl lg:hidden print:hidden">
          <ToggleGroup type="single" className="segmented-control w-full" value={mobilePanel} onValueChange={(v) => v && setMobilePanel(v as "form" | "photo")} aria-label={t("ui.documentForm")}>
            <ToggleGroupItem value="form" className="min-w-0 flex-1 gap-2 px-3 text-xs leading-snug whitespace-normal"><FileText className="size-4" aria-hidden />{t("ui.documentForm")}</ToggleGroupItem>
            <ToggleGroupItem value="photo" className="min-w-0 flex-1 gap-2 px-3 text-xs leading-snug whitespace-normal"><FileImage className="size-4" aria-hidden />{t("review.original")}</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Photo */}
        <aside id="photo-panel" tabIndex={-1} aria-label={t("review.original")} className={cn("min-w-0 scroll-mt-36 rounded-3xl lg:sticky lg:top-24 print:hidden", mobilePanel !== "photo" && "hidden lg:block")}>
          <div className="workspace-panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
              <FileImage className="size-4 text-muted-foreground" aria-hidden />
              {t("review.original")}
              {(downloads?.pdf || downloads?.photo) && (
                <span className="ml-auto flex gap-1.5">
                  {downloads.pdf && (
                    <a href={downloads.pdf} className="press inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground">
                      <Download className="size-3.5" aria-hidden />
                      {t("dl.pdf")}
                    </a>
                  )}
                  {downloads.photo && (
                    <a href={downloads.photo} className="press inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-medium">
                      <Download className="size-3.5" aria-hidden />
                      {t("dl.photo")}
                    </a>
                  )}
                </span>
              )}
            </div>
            <div className="p-3">
              {(isDesktop || mobilePanel === "photo") && <PhotoViewer
                src={photoUrl}
                alt={t("photo.alt")}
                focus={focus}
                className="max-h-[65dvh] lg:max-h-[calc(100dvh-17rem)]"
                labels={{ zoomIn: t("photo.zoomIn"), zoomOut: t("photo.zoomOut"), reset: t("photo.reset"), rotate: t("photo.rotate") }}
              />}
            </div>
            <p className="border-t px-5 py-3 text-xs leading-relaxed text-muted-foreground">{t("ui.originalHint")}</p>
          </div>
        </aside>
        </>}

        <div className={cn("grid min-w-0 content-start gap-5 print:block", mobilePanel === "photo" && "hidden lg:grid")}>
          {/* Header: title + form language + view/edit */}
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <h3 className="hidden text-sm font-semibold sm:block">{t("ui.documentForm")}</h3>
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup type="single" variant="outline" size="sm" className="segmented-control" value={view} onValueChange={changeView} aria-label={t("quick.view")}>
                <ToggleGroupItem value="quick" className="px-3">{t("quick.quick")}</ToggleGroupItem>
                <ToggleGroupItem value="detail" className="px-3">{t("quick.detail")}</ToggleGroupItem>
              </ToggleGroup>
              {view === "detail" && !editing && (
                <ToggleGroup type="single" variant="outline" size="sm" className="segmented-control" value={formMode} onValueChange={changeFormMode} aria-label={t("app.formLang")}>
                  {FORM_MODES.map(([k, label]) => (
                    <ToggleGroupItem key={k} value={k} lang={k === "all" ? undefined : k} className="px-2.5">
                      {k === "all" ? t("app.all3") : label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
              {view === "detail" && <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={editing ? "edit" : "view"}
                className="segmented-control"
                onValueChange={(v) => v && setEditing(v === "edit")}
                aria-label={`${t("app.view")} / ${t("app.edit")}`}
              >
                <ToggleGroupItem value="view" className="px-3">
                  {t("app.view")}
                </ToggleGroupItem>
                <ToggleGroupItem value="edit" className="px-3">
                  {t("app.edit")}
                </ToggleGroupItem>
              </ToggleGroup>}
            </div>
          </div>

          {!isSample && <VendorPicker />}

          {view === "quick" ? (
            <QuickCard onJump={showField} manual={manual} />
          ) : (
          <>
          {/* Category, payment, paid */}
          <div className="workspace-panel overflow-hidden text-sm print:hidden">
            <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 px-5 py-3 text-left font-medium sm:hidden" aria-expanded={metadataOpen} aria-controls="document-payment-details" onClick={() => setMetadataOpen((open) => !open)}>
              <span>{t("app.category")} · {t("app.payment")}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground"><StickerDots stickers={doc.stickers} />{paid ? t("app.paid") : t("app.unpaid")}<ChevronDown aria-hidden className={cn("size-4 transition-transform", metadataOpen && "rotate-180")} /></span>
            </button>
            <div id="document-payment-details" className={cn("grid gap-4 border-t p-5 sm:grid-cols-2 sm:border-t-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]", !metadataOpen && "hidden sm:grid")}>
            <label className="grid min-w-0 content-start gap-2">
              <span className="text-xs text-muted-foreground">{t("app.category")}</span>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger size="sm" className="h-10 w-full" aria-label={t("app.category")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`category.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </label>
            <label className="grid min-w-0 content-start gap-2">
              <span className="text-xs text-muted-foreground">{t("app.payment")}</span>
              <Controller
                control={control}
                name="payment"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger size="sm" className="h-10 w-full" aria-label={t("app.payment")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENTS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`payment.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </label>
            <div className="flex min-w-0 flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-1 xl:pt-5">
              <Controller
                control={control}
                name="paid"
                render={({ field }) => (
                  <label className="flex min-h-10 items-center gap-2 whitespace-nowrap">
                    <Checkbox
                      checked={!!field.value}
                      onCheckedChange={(v) => {
                        const on = v === true;
                        field.onChange(on);
                        if (on && !getValues("paidDate")) setValue("paidDate", todayBangkok(), { shouldDirty: true });
                      }}
                    />
                    {t("app.paid")}
                  </label>
                )}
              />
              {paid && (
                <Input type="date" aria-label={t("app.paidOn")} className="h-10 w-40 max-w-full" {...form.register("paidDate")} />
              )}
            </div>
            <div className="grid min-w-0 gap-2 sm:col-span-2 xl:col-span-3">
              <span className="text-xs text-muted-foreground">{t("archive.stickers")}</span>
              <Controller
                control={control}
                name="stickers"
                render={({ field }) => <StickerPicker value={field.value ?? []} onChange={(v) => field.onChange(v)} />}
              />
            </div>
            <TaxFields />
            </div>
          </div>

          {editing && <TranslateBadge />}
          {editing ? <InvoiceEdit mode={formMode} /> : <InvoiceView doc={doc} mode={formMode} onUnsure={showField} signable />}
          </>
          )}

          <ChecksPanel results={results} unclear={doc.unclear} onJump={showField} className="print:hidden" />

          {/* Actions */}
          <div className="review-actions flex flex-wrap items-center gap-2 print:hidden">
            <Button type="submit" className="h-11 rounded-full px-6 text-[15px] max-sm:flex-1" disabled={!!busy}>
              {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {busy === "save" ? t("app.saving") : (saveLabel ?? t("app.save"))}
            </Button>
            {onDraft && (
              <Button type="button" variant="secondary" className="h-11 rounded-full px-4" onClick={draft} disabled={!!busy}>
                {busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <FilePen className="size-4" />}
                {t("archive.draftSave")}
              </Button>
            )}
            <Button type="button" variant="ghost" className="h-11 rounded-full px-4" onClick={onClose} disabled={!!busy}>
              <X className="size-4" />
              {t("app.close")}
            </Button>
            <Button type="button" variant="ghost" className="h-11 rounded-full px-4" onClick={() => window.print()} disabled={!!busy}>
              <Printer className="size-4" />
              <span className="max-sm:sr-only">{t("app.print")}</span>
            </Button>
            <span className="hidden flex-1 sm:block" />
            {!isNew && onDelete && (
              <DeleteFlow
                isAdmin={me.role === "admin"}
                disabled={!!busy}
                paper={{ title: doc.docNo || t("ui.documentForm"), seller: joinTri(doc.seller.name, "en") || joinTri(doc.seller.name, "th"), amount: baht(doc.totals.net) }}
                onDelete={onDelete}
                onDone={onDeleted ?? onClose}
              />
            )}
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
