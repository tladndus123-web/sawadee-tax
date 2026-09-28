"use client";

import { useBranchName } from "@/components/layout/branch-switcher";
import { ALL, BRANCH_COLORS, branchLabel, byId, colorOf, headOf } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { isDepreciated } from "@/lib/cost-split";
import { ArchiveRestore, CalendarDays, ChevronDown, ChevronRight, CircleCheck, FilePen, ImagePlus, Loader2, Lock, Search, Trash2, TriangleAlert, X, UserCheck, Check, Tags, Refrigerator } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useScreenDate } from "@/components/ScreenDate";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Link } from "@/i18n/navigation";
import { AddDocButtons } from "@/components/upload/AddDocButtons";
import { type ArchiveFilter, groupByMonth, matches, monthKey, NO_DATE, search, isUnpaid } from "@/lib/archive";
import { joinTri } from "@/lib/form-labels";
import { healThumb, type LedgerEntry, type LedgerView, pick, restoreEntry, restoreMany, setQuick, useLedger, usePhotoUrl, setAck } from "@/lib/ledger-store";
import { useMonthLocks } from "@/lib/month-lock-store";
import { useCompany } from "@/lib/company-store";
import { openWarnings } from "@/lib/dashboard";
import { baht } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { todayBangkok } from "@/lib/thai-tax";
import { STICKERS, type Sticker } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BulkCategoryBar } from "./BulkCategoryBar";
import { BulkPayBar } from "./BulkPayBar";
import { ExportButtons } from "./ExportButtons";
import { MonthLockButton } from "./MonthLockButton";
import { PurgeButton } from "./PurgeButton";
import { StickerDot, StickerDots, StickerPopover, useMonthLabel, useStickerLabel } from "./Stickers";

/** Ledger as a monthly archive, with colour-sticker filters, drafts and the admin-only trash. */
export function LedgerList() {
  const t = useTranslations();
  const me = useMe();
  const { entries, loaded } = useLedger();
  const [tab, setTab] = useState<LedgerView>("ledger");
  const [filter, setFilter] = useState<ArchiveFilter>({ stickers: [], unpaidOnly: false });
  const isAdmin = me.role === "admin";
  const locks = useMonthLocks();
  // Payment run: tick unpaid documents, then mark them all paid at once (BulkPayBar)
  const [selecting, setSelecting] = useState(false);
  // What the ticks are for: a payment run, or giving several documents one category
  const [mode, setMode] = useState<"pay" | "category">("pay");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const stopSelecting = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);
  const view: LedgerView = tab === "trash" && !isAdmin ? "ledger" : tab;
  const counts = useMemo(
    () => ({ ledger: pick(entries, "ledger").length, drafts: pick(entries, "drafts").length, trash: pick(entries, "trash").length }),
    [entries],
  );
  const list = useMemo(() => pick(entries, view), [entries, view]);
  const assetCount = useMemo(() => pick(entries, "ledger").filter((e) => isDepreciated(e.doc)).length, [entries]);
  const [query, setQuery] = useState("");
  // The box shows every key at once; the list follows a moment later, so typing never waits for it
  // (the list parts below are memoized, so a keystroke itself only redraws the search box)
  const q = useDeferredValue(query);
  const filtered = useMemo(
    () => (view === "ledger" ? list.filter((e) => matches(e.doc, filter)) : list).filter((e) => search(e.doc, q)),
    [list, view, filter, q],
  );
  const months = useMemo(
    () => groupByMonth(filtered).map((g) => ({ group: g, monthEntries: list.filter((e) => monthKey(e.doc) === g.key) })),
    [filtered, list],
  );
  const filtering = filter.stickers.length > 0 || filter.unpaidOnly || q.trim() !== "";
  const company = useCompany();
  // Same rule as the dashboard tile "needs a look", duplicates included
  const check = useMemo(
    () => openWarnings(pick(entries, "ledger").map((e) => ({ id: e.id, doc: e.doc, ack: e.ackFlags })), company.taxId, todayBangkok()),
    [entries, company.taxId],
  );

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-3">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("nav.ledger")}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <AddDocButtons size="sm" />
              {assetCount > 0 && (
                <Link href="/ledger/assets" className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-primary hover:bg-primary/10">
                  <Refrigerator className="size-4" aria-hidden />
                  {t("assets.link", { count: assetCount })}
                </Link>
              )}
            </div>
          </div>
          <ToggleGroup type="single" className="segmented-control" value={view} onValueChange={(v) => {
              if (!v) return;
              setTab(v as LedgerView);
              stopSelecting();
            }} aria-label={t("nav.ledger")}>
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
        {list.length > 0 && (
          <label className="relative block">
            <span className="sr-only">{t("archive.search")}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("archive.search")}
              className="h-11 w-full rounded-full border bg-card pr-4 pl-10 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20"
            />
          </label>
        )}
        {view === "ledger" && counts.ledger > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilterBar filter={filter} onChange={setFilter} entries={list} />
            {selecting ? (
              <Button type="button" variant="secondary" className="h-9 rounded-full px-3.5 text-[13px]" onClick={stopSelecting}>
                <X className="size-4" />
                {t("bulk.stop")}
              </Button>
            ) : (
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-full px-3 text-[13px]"
                  onClick={() => {
                    setMode("pay");
                    setSelecting(true);
                    setFilter((f) => ({ ...f, unpaidOnly: true }));
                  }}
                >
                  <CircleCheck className="size-4" />
                  {t("bulk.start")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-full px-3 text-[13px]"
                  onClick={() => {
                    setMode("category");
                    setSelecting(true);
                  }}
                >
                  <Tags className="size-4" />
                  {t("bulkCat.start")}
                </Button>
              </div>
            )}
          </div>
        )}
        {selecting && view === "ledger" && <p className="text-xs text-muted-foreground">{mode === "pay" ? t("bulk.hint") : t("bulkCat.hint")}</p>}
        {view === "trash" && counts.trash > 0 && (
          <div className="flex justify-end">
            <Button type="button" variant={selecting ? "secondary" : "ghost"} className="h-9 rounded-full px-3.5 text-[13px]" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? <X className="size-4" /> : <CircleCheck className="size-4" />}
              {selecting ? t("bulk.stop") : t("trashBulk.start")}
            </Button>
          </div>
        )}
        {view === "drafts" && <p className="rounded-2xl bg-warn-soft/60 px-4 py-3 text-xs leading-relaxed text-warn">{t("archive.draftNote")}</p>}
      </header>

      {!loaded ? (
        <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : filtered.length === 0 ? (
        <Empty
          view={view}
          filtering={filtering}
          onClear={() => {
            setFilter({ stickers: [], unpaidOnly: false });
            setQuery("");
          }}
        />
      ) : view === "trash" ? (
        <div className="grid gap-3">
          <ul className="grid gap-3">
            {filtered.map((e) => (
              <TrashRow key={e.id} e={e} selectable={selecting} checked={selected.has(e.id)} onToggle={toggle} />
            ))}
          </ul>
          {selecting && (
            <TrashBar
              ids={filtered.filter((e) => selected.has(e.id)).map((e) => e.id)}
              all={filtered.map((e) => e.id)}
              onSelectAll={(ids) => setSelected(new Set(ids))}
              onDone={stopSelecting}
            />
          )}
        </div>
      ) : view === "drafts" ? (
        <ul className="grid gap-3">
          {filtered.map((e) => (
            <DocRow key={e.id} e={e} draft />
          ))}
        </ul>
      ) : (
        <div className="grid gap-4">
          {months.map(({ group, monthEntries }, i) => (
            // Starting or clearing a search re-opens the months (every match is shown while searching)
            <MonthSection
              key={`${group.key}:${q.trim() !== ""}`}
              group={group}
              defaultOpen={i < 3 || q.trim() !== ""}
              monthEntries={monthEntries}
              check={check}
              locked={locks.has(group.key)}
              isAdmin={isAdmin}
              selecting={selecting ? mode : null}
              selected={selected}
              onToggle={toggle}
            />
          ))}
          {selecting && mode === "pay" && <BulkPayBar chosen={list.filter((e) => selected.has(e.id) && isUnpaid(e.doc))} onDone={stopSelecting} />}
          {selecting && mode === "category" && <BulkCategoryBar chosen={list.filter((e) => selected.has(e.id))} onDone={stopSelecting} />}
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

const MonthSection = memo(function MonthSection({
  group,
  defaultOpen,
  monthEntries,
  check,
  locked,
  isAdmin,
  selecting,
  selected,
  onToggle,
}: {
  group: ReturnType<typeof groupByMonth<LedgerEntry>>[number];
  defaultOpen: boolean;
  /** Every saved document of this month (exports ignore the sticker / unpaid filter) */
  monthEntries: LedgerEntry[];
  check: Map<string, string[]>;
  /** Tax month closed (month_locks): its saved documents can't change */
  locked: boolean;
  isAdmin: boolean;
  /** Ticking for a payment run ("pay": unpaid only) or for a category ("category": any, closed months excepted) */
  selecting: "pay" | "category" | null;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("archive");
  const tl = useTranslations("lock");
  const monthLabel = useMonthLabel();
  const current = group.key === monthKey({ date: todayBangkok() });
  // Rows (and their photos) exist only while the month is open: a year of documents stays light
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group workspace-panel overflow-hidden">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto sm:flex-1">
          <span className="intelligence-mark is-soft size-9 flex-none">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[17px] font-semibold tracking-tight">
              <span className="whitespace-nowrap">{monthLabel(group.key)}</span>
              {current && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-brand">{t("thisMonth")}</span>}
              {locked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-muted-foreground">
                  <Lock className="size-3" aria-hidden />
                  {tl("badge")}
                </span>
              )}
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
      {open && (
        <div className="grid gap-2 border-t bg-muted/30 p-2 sm:p-3">
          {group.key !== NO_DATE && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isAdmin ? <MonthLockButton month={group.key} label={monthLabel(group.key)} locked={locked} /> : <span />}
              <ExportButtons month={group.key} entries={monthEntries} />
            </div>
          )}
          <ul className="grid gap-2">
            {group.items.map((e) => (
              <DocRow
                key={e.id}
                e={e}
                open={check.get(e.id)}
                selectable={selecting === "pay" ? isUnpaid(e.doc) : selecting === "category" && !locked}
                checked={selected.has(e.id)}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </div>
      )}
    </details>
  );
});

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
          <AddDocButtons className="justify-center" />
        ))}
    </div>
  );
}

function Thumb({ path }: { path: string | null }) {
  const url = usePhotoUrl(path, "thumb");
  // No small copy yet (older photo): the full photo is shown, and becomes the source of the copy
  const isCopy = url?.includes(".thumb.jpg");
  return (
    <span className="block size-12 flex-none overflow-hidden rounded-xl bg-muted sm:size-16">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL of a private photo
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          crossOrigin="anonymous"
          onLoad={(ev) => !isCopy && path && void healThumb(ev.currentTarget, path)}
          className="size-full object-cover"
        />
      )}
    </span>
  );
}

/** "All branches": a small tag with the document's branch (nothing when one branch is chosen, or only one exists) */
function BranchTag({ id }: { id: string }) {
  const names = useBranchName();
  const { branches } = useBranches();
  const selected = useBranch();
  if (selected !== ALL || branches.length < 2) return null;
  const b = byId(branches, id) ?? headOf(branches);
  if (!b) return null;
  const [fg, bg] = BRANCH_COLORS[colorOf(b, branches)];
  return (
    <span className="inline-flex max-w-[8rem] items-center truncate rounded-full px-1.5 py-px text-[11px] font-semibold" style={{ color: fg, background: bg }}>
      {branchLabel(b, names)}
    </span>
  );
}

const sellerOf = (e: LedgerEntry) => joinTri(e.doc.seller.name, "en") || joinTri(e.doc.seller.name, "th") || e.doc.docNo || "—";

/** One document; stickers can be changed right from the list. */
const DocRow = memo(function DocRow({
  e,
  draft,
  open,
  selectable,
  checked,
  onToggle,
}: {
  e: LedgerEntry;
  draft?: boolean;
  /** Warnings still open (not marked "문제 없음") */
  open?: string[];
  /** Payment run: this unpaid document can be ticked */
  selectable?: boolean;
  checked?: boolean;
  onToggle?: (id: string) => void;
}) {
  const t = useTranslations();
  const sd = useScreenDate();
  const locale = useLocale();
  const monthLabel = useMonthLabel();
  const setStickers = async (stickers: Sticker[]) => {
    await setQuick(e.id, { stickers });
  };
  const flagged = !!open?.length;
  const accepted = !flagged && e.ackFlags.length > 0;
  // "문제 없음": the open warnings join the accepted ones; undo restores what was there before
  const accept = async () => {
    const before = e.ackFlags;
    try {
      await setAck(e.id, [...before, ...(open ?? [])]);
      toast.success(t("ack.done"), { action: { label: t("ack.undo"), onClick: () => void setAck(e.id, before) } });
    } catch {
      toast.error(t("app.saveFail"));
    }
  };
  return (
    <li className={cn("tap-row flex min-w-0 flex-wrap items-center gap-x-1 rounded-2xl bg-card pr-2 shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--input),var(--shadow-soft)]", checked && "ring-2 ring-primary")}>
      {selectable && (
        <Checkbox
          checked={!!checked}
          onCheckedChange={() => onToggle?.(e.id)}
          aria-label={sellerOf(e)}
          className="ml-3 size-5 flex-none rounded-md"
        />
      )}
      <Link href={`/documents/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-2.5 sm:gap-4 sm:p-3">
        <Thumb path={e.photoPath} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[15px] font-semibold">{sellerOf(e)}</span>
            {draft && <span className="flex-none rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">{t("archive.draftBadge")}</span>}
            <span className="ml-auto flex-none text-[15px] font-semibold whitespace-nowrap tabular-nums">{baht(e.doc.totals.net)}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs whitespace-nowrap text-muted-foreground">
            {e.doc.docNo && <span className="mono max-sm:hidden">{e.doc.docNo}</span>}
            <BranchTag id={e.doc.branchId} />
            {e.doc.date && <span>{sd(e.doc.date)}</span>}
            {draft && <span className="font-medium">{monthLabel(monthKey(e.doc))}</span>}
            {isUnpaid(e.doc) && !draft && <span className="text-warn">{t("app.unpaid")}</span>}
            {flagged && (
              <span className="inline-flex items-center gap-1 font-medium text-bad">
                <TriangleAlert className="size-3" aria-hidden />
                {t("app.sCheck")}
              </span>
            )}
            {accepted && (
              // A person looked at the warnings and let them go — not the app saying all is well: neutral, with who
              <span className="inline-flex items-center gap-1 font-medium text-muted-foreground" title={t("ack.hint")}>
                <UserCheck className="size-3" aria-hidden />
                {t("ack.label", { who: e.ackBy ?? t("ack.someone") })}
              </span>
            )}
          </span>
          {draft && (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {t("archive.editedAt", { when: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(e.updatedAt) })}
            </span>
          )}
        </span>
      </Link>
      {/* phones: a line break, so the button below gets a line of its own */}
      {flagged && !draft && <span aria-hidden className="h-0 basis-full sm:hidden max-sm:order-last" />}
      {flagged && !draft && (
        <button
          type="button"
          onClick={() => void accept()}
          className="press flex h-8 flex-none items-center gap-1 rounded-full border border-input bg-background px-2.5 text-xs font-medium hover:bg-muted max-sm:order-last max-sm:mb-2.5 max-sm:ml-[70px]"
          title={t("ack.hint")}
        >
          <Check className="size-3.5" aria-hidden />
          {t("ack.button")}
        </button>
      )}
      <StickerPopover value={e.doc.stickers} onChange={setStickers} label={t("archive.stickerEdit")} />
      <ChevronRight className="hidden size-4 flex-none text-muted-foreground sm:block" aria-hidden />
    </li>
  );
});

/** Trash, several at once: bring back or delete for good the ticked documents */
function TrashBar({ ids, all, onSelectAll, onDone }: { ids: string[]; all: string[]; onSelectAll: (ids: string[]) => void; onDone: () => void }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  return (
    <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center justify-between gap-2 rounded-full border bg-[var(--glass)] py-2 pr-2 pl-5 shadow-[var(--shadow-lift)] backdrop-blur-xl md:bottom-4">
      <p className="flex items-center gap-3 text-sm">
        <span className="font-semibold">{t("bulk.selected", { count: ids.length })}</span>
        <button type="button" className="text-primary hover:underline" onClick={() => onSelectAll(ids.length === all.length ? [] : all)}>
          {ids.length === all.length ? t("trashBulk.none") : t("trashBulk.all")}
        </button>
      </p>
      <span className="flex items-center gap-1">
        <Button
          type="button"
          className="h-10 rounded-full px-4"
          disabled={busy || !ids.length}
          onClick={async () => {
            setBusy(true);
            try {
              const n = await restoreMany(ids);
              toast.success(t("trashBulk.restored", { count: n }));
              onDone();
            } catch {
              toast.error(t("app.saveFail"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />}
          {t("trash.restore")}
        </Button>
        <PurgeButton ids={ids} onDone={onDone} />
      </span>
    </div>
  );
}

function TrashRow({
  e,
  selectable,
  checked,
  onToggle,
}: {
  e: LedgerEntry;
  selectable?: boolean;
  checked?: boolean;
  onToggle?: (id: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const when = e.deletedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(e.deletedAt) : "";
  return (
    <li className={cn("workspace-panel grid gap-3 p-3 sm:p-4", checked && "ring-2 ring-primary")}>
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {selectable && <Checkbox checked={!!checked} onCheckedChange={() => onToggle?.(e.id)} aria-label={sellerOf(e)} className="size-5 flex-none rounded-md" />}
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
        {!selectable && (
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
        )}
        {!selectable && <PurgeButton ids={[e.id]} name={sellerOf(e)} />}
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
