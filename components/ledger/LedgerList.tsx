"use client";

import { ArchiveRestore, CalendarDays, ChevronDown, ChevronRight, FilePen, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Link } from "@/i18n/navigation";
import { type ArchiveFilter, groupByMonth, matches, monthKey, NO_DATE } from "@/lib/archive";
import { joinTri } from "@/lib/form-labels";
import { type LedgerEntry, type LedgerView, pick, restoreEntry, saveEntry, useLedger, usePhotoUrl } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { dmy, todayBangkok } from "@/lib/thai-tax";
import { STICKERS, type Sticker } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExportButtons } from "./ExportButtons";
import { StickerDot, StickerDots, StickerPopover, useMonthLabel, useStickerLabel } from "./Stickers";

/** Ledger as a monthly archive, with colour-sticker filters, drafts and the admin-only trash. */
export function LedgerList() {
  const t = useTranslations();
  const me = useMe();
  const { entries, loaded } = useLedger();
  const [tab, setTab] = useState<LedgerView>("ledger");
  const [filter, setFilter] = useState<ArchiveFilter>({ stickers: [], unpaidOnly: false });
  const isAdmin = me.role === "admin";
  const view: LedgerView = tab === "trash" && !isAdmin ? "ledger" : tab;
  const counts = { ledger: pick(entries, "ledger").length, drafts: pick(entries, "drafts").length, trash: pick(entries, "trash").length };
  const list = pick(entries, view);
  const filtered = view === "ledger" ? list.filter((e) => matches(e.doc, filter)) : list;
  const filtering = filter.stickers.length > 0 || filter.unpaidOnly;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("nav.ledger")}</h1>
          <ToggleGroup type="single" className="segmented-control" value={view} onValueChange={(v) => v && setTab(v as LedgerView)} aria-label={t("nav.ledger")}>
            <ToggleGroupItem value="ledger" className="gap-1.5 px-3.5">
              {t("trash.ledgerTab")} <span className="mono text-xs opacity-60">{counts.ledger}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="drafts" className="gap-1.5 px-3.5">
              <FilePen className="size-4" aria-hidden />
              {t("archive.draftTab")} <span className="mono text-xs opacity-60">{counts.drafts}</span>
            </ToggleGroupItem>
            {isAdmin && (
              <ToggleGroupItem value="trash" className="gap-1.5 px-3.5">
                <Trash2 className="size-4" aria-hidden />
                {t("trash.trashTab")} <span className="mono text-xs opacity-60">{counts.trash}</span>
              </ToggleGroupItem>
            )}
          </ToggleGroup>
        </div>
        {view === "ledger" && counts.ledger > 0 && <FilterBar filter={filter} onChange={setFilter} entries={list} />}
        {view === "drafts" && <p className="rounded-2xl bg-warn-soft/60 px-4 py-3 text-xs leading-relaxed text-warn">{t("archive.draftNote")}</p>}
      </header>

      {!loaded ? (
        <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : filtered.length === 0 ? (
        <Empty view={view} filtering={filtering} onClear={() => setFilter({ stickers: [], unpaidOnly: false })} />
      ) : view === "trash" ? (
        <ul className="grid gap-3">
          {filtered.map((e) => (
            <TrashRow key={e.id} e={e} />
          ))}
        </ul>
      ) : view === "drafts" ? (
        <ul className="grid gap-3">
          {filtered.map((e) => (
            <DocRow key={e.id} e={e} draft />
          ))}
        </ul>
      ) : (
        <div className="grid gap-4">
          {groupByMonth(filtered).map((g, i) => (
            <MonthSection key={g.key} group={g} defaultOpen={i < 3} monthEntries={list.filter((e) => monthKey(e.doc) === g.key)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({ filter, onChange, entries }: { filter: ArchiveFilter; onChange: (f: ArchiveFilter) => void; entries: LedgerEntry[] }) {
  const t = useTranslations("archive");
  const label = useStickerLabel();
  const used = STICKERS.filter((c) => entries.some((e) => e.doc.stickers.includes(c)));
  const toggle = (c: Sticker) =>
    onChange({ ...filter, stickers: filter.stickers.includes(c) ? filter.stickers.filter((s) => s !== c) : [...filter.stickers, c] });
  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
      on ? "bg-foreground text-background" : "bg-card text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:text-foreground",
    );
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t("stickers")}>
      <button type="button" aria-pressed={!filter.stickers.length} className={chip(!filter.stickers.length)} onClick={() => onChange({ ...filter, stickers: [] })}>
        {t("stickerAll")}
      </button>
      {used.map((c) => (
        <button key={c} type="button" aria-pressed={filter.stickers.includes(c)} className={chip(filter.stickers.includes(c))} onClick={() => toggle(c)}>
          <StickerDot color={c} />
          {label(c)}
        </button>
      ))}
      <span className="mx-1 w-px flex-none self-stretch bg-border" aria-hidden />
      <button type="button" aria-pressed={filter.unpaidOnly} className={chip(filter.unpaidOnly)} onClick={() => onChange({ ...filter, unpaidOnly: !filter.unpaidOnly })}>
        {t("unpaidOnly")}
      </button>
    </div>
  );
}

function MonthSection({
  group,
  defaultOpen,
  monthEntries,
}: {
  group: ReturnType<typeof groupByMonth<LedgerEntry>>[number];
  defaultOpen: boolean;
  /** Every saved document of this month (exports ignore the sticker / unpaid filter) */
  monthEntries: LedgerEntry[];
}) {
  const t = useTranslations("archive");
  const monthLabel = useMonthLabel();
  const current = group.key === monthKey({ date: todayBangkok() });
  return (
    <details open={defaultOpen} className="group workspace-panel overflow-hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto sm:flex-1">
          <span className="intelligence-mark is-soft size-9 flex-none">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[17px] font-semibold tracking-tight">
              <span className="whitespace-nowrap">{monthLabel(group.key)}</span>
              {current && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-brand">{t("thisMonth")}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("docs", { count: group.items.length })}
              {group.unpaid > 0 && <span className="text-warn"> · {t("unpaid", { count: group.unpaid })}</span>}
            </span>
          </span>
        </span>
        <span className="grid flex-1 pl-[46px] sm:flex-none sm:pl-0 sm:text-right">
          <span className="text-[17px] font-semibold tabular-nums">{baht(group.net)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("vat")} {baht(group.vat)}
          </span>
        </span>
        <ChevronDown className="size-4 flex-none text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-2 border-t bg-muted/30 p-2 sm:p-3">
        {group.key !== NO_DATE && <ExportButtons month={group.key} entries={monthEntries} />}
        <ul className="grid gap-2">
          {group.items.map((e) => (
            <DocRow key={e.id} e={e} />
          ))}
        </ul>
      </div>
    </details>
  );
}

function Empty({ view, filtering, onClear }: { view: LedgerView; filtering: boolean; onClear: () => void }) {
  const t = useTranslations();
  const text = view === "trash" ? t("trash.trashEmpty") : view === "drafts" ? t("archive.draftEmpty") : filtering ? t("archive.noMatch") : t("trash.empty");
  return (
    <div className="workspace-panel grid justify-items-center gap-4 px-6 py-16 text-center">
      <span className="intelligence-mark is-soft size-14 text-muted-foreground">
        {view === "trash" ? <Trash2 className="size-6" aria-hidden /> : view === "drafts" ? <FilePen className="size-6" aria-hidden /> : <ImagePlus className="size-6" aria-hidden />}
      </span>
      <p className="text-[15px] text-muted-foreground">{text}</p>
      {view === "ledger" &&
        (filtering ? (
          <Button type="button" variant="secondary" className="rounded-full" onClick={onClear}>
            <X className="size-4" />
            {t("archive.clear")}
          </Button>
        ) : (
          <Button asChild className="rounded-full px-5">
            <Link href="/upload">
              <ImagePlus className="size-4" />
              {t("batch.cta")}
            </Link>
          </Button>
        ))}
    </div>
  );
}

function Thumb({ path }: { path: string | null }) {
  const url = usePhotoUrl(path);
  return (
    <span className="block size-12 flex-none overflow-hidden rounded-xl bg-muted sm:size-16">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob URL */}
      {url && <img src={url} alt="" className="size-full object-cover" />}
    </span>
  );
}

const sellerOf = (e: LedgerEntry) => joinTri(e.doc.seller.name, "en") || joinTri(e.doc.seller.name, "th") || e.doc.docNo || "—";

/** One document; stickers can be changed right from the list. */
function DocRow({ e, draft }: { e: LedgerEntry; draft?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const monthLabel = useMonthLabel();
  const setStickers = async (stickers: Sticker[]) => {
    await saveEntry({ ...e.doc, stickers }, null, e.id, e.status);
  };
  return (
    <li className="flex min-w-0 items-center gap-1 rounded-2xl bg-card pr-2 shadow-[0_0_0_1px_var(--border)] transition-shadow hover:shadow-[0_0_0_1px_var(--input),var(--shadow-soft)]">
      <Link href={`/documents/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-2.5 sm:gap-4 sm:p-3">
        <Thumb path={e.photoPath} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{sellerOf(e)}</span>
            {draft && <span className="flex-none rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">{t("archive.draftBadge")}</span>}
          </span>
          <span className="mt-0.5 block text-[15px] font-semibold tabular-nums sm:hidden">{baht(e.doc.totals.net)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs whitespace-nowrap text-muted-foreground">
            {e.doc.docNo && <span className="mono max-sm:hidden">{e.doc.docNo}</span>}
            {e.doc.date && <span>{dmy(e.doc.date)}</span>}
            {draft && <span className="font-medium">{monthLabel(monthKey(e.doc))}</span>}
            {!e.doc.paid && !draft && <span className="text-warn">{t("app.unpaid")}</span>}
          </span>
          {draft && (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {t("archive.editedAt", { when: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(e.updatedAt) })}
            </span>
          )}
        </span>
        <span className="hidden text-right text-[15px] font-semibold tabular-nums sm:block">{baht(e.doc.totals.net)}</span>
      </Link>
      <StickerPopover value={e.doc.stickers} onChange={setStickers} label={t("archive.stickerEdit")} />
      <ChevronRight className="hidden size-4 flex-none text-muted-foreground sm:block" aria-hidden />
    </li>
  );
}

function TrashRow({ e }: { e: LedgerEntry }) {
  const t = useTranslations();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const when = e.deletedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(e.deletedAt) : "";
  return (
    <li className="workspace-panel grid gap-3 p-3 sm:p-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <span className="flex-none opacity-60 grayscale">
          <Thumb path={e.photoPath} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-muted-foreground line-through decoration-1">{sellerOf(e)}</span>
            <StickerDots stickers={e.doc.stickers} />
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{baht(e.doc.totals.net)}</span>
        </span>
        <Button
          type="button"
          className="h-10 rounded-full px-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await restoreEntry(e.id);
            toast.success(t("trash.restored"));
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
          {t("trash.restore")}
        </Button>
      </div>
      <dl className="grid gap-x-4 gap-y-1 rounded-xl bg-muted/60 px-3 py-2.5 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{t("trash.reason")}</dt>
        <dd className="font-medium [overflow-wrap:anywhere]">{e.deleteReason}</dd>
        <dt className="text-muted-foreground">{t("trash.deletedBy")}</dt>
        <dd>{e.deletedBy}</dd>
        <dt className="text-muted-foreground">{t("trash.deletedAt")}</dt>
        <dd className="tabular-nums">{when}</dd>
      </dl>
    </li>
  );
}
