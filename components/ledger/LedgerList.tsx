"use client";

import { useBranchName } from "@/components/layout/branch-switcher";
import { ALL, BRANCH_COLORS, branchLabel, byId, colorOf, headOf } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { isDepreciated } from "@/lib/cost-split";
import { ArchiveRestore, Bookmark, Calculator, CalendarDays, Check, ChevronDown, ChevronRight, CircleCheck, CircleDollarSign, Coins, Copy, Ellipsis, FilePen, ImagePlus, ListChecks, Loader2, Lock, Refrigerator, Search, SlidersHorizontal, Tags, Trash2, TriangleAlert, UserCheck, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useScreenDate } from "@/components/ScreenDate";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type DayBucket, groupByDays } from "@/lib/ledger-days";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Link } from "@/i18n/navigation";
import { AddDocButtons } from "@/components/upload/AddDocButtons";
import { type ArchiveFilter, groupByMonth, hasCategory, matches, monthKey, NO_DATE, search, isUnpaid } from "@/lib/archive";
import { useCategoryOptions } from "@/components/vendors/CategoryIcon";
import { useDocName } from "./doc-name";
import { joinTri } from "@/lib/form-labels";
import { healThumb, type LedgerEntry, type LedgerView, pick, restoreEntry, restoreMany, setQuick, useLedger, usePhotoUrl, setAck } from "@/lib/ledger-store";
import { useMonthLocks } from "@/lib/month-lock-store";
import { useCompany } from "@/lib/company-store";
import { openWarnings } from "@/lib/dashboard";
import { baht, fromSatang, toSatang } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { canOpen } from "@/lib/screens";
import { todayBangkok } from "@/lib/thai-tax";
import { STICKERS, type Sticker } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BulkCategoryBar } from "./BulkCategoryBar";
import { BulkPayBar } from "./BulkPayBar";
import { DupReview } from "./DupReview";
import { dupGroupsIn } from "@/lib/dup-groups";
import { ExportButtons } from "./ExportButtons";
import { SavedViews } from "./SavedViews";
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
  // The status chips on top: only the documents that need a look, or the ones that may be in twice
  const [statusPick, setStatus] = useState<"check" | "dup" | null>(null);
  const company = useCompany();
  // Same rule as the dashboard tile "needs a look", duplicates included
  const check = useMemo(
    () => openWarnings(pick(entries, "ledger").map((e) => ({ id: e.id, doc: e.doc, ack: e.ackFlags })), company.taxId, todayBangkok()),
    [entries, company.taxId],
  );
  const statusCounts = useMemo(
    () => ({
      check: check.size,
      dup: [...check.values()].filter((f) => f.includes("dup")).length,
      unpaid: pick(entries, "ledger").filter((e) => isUnpaid(e.doc)).length,
    }),
    [check, entries],
  );
  // A link can open the ledger at the duplicate review (/ledger?status=dup: month-end checklist, the close dialog)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("status") === "dup") setStatus("dup");
  }, []);
  const reviewDups = useCallback(() => {
    setTab("ledger");
    setStatus("dup");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const savedDocs = useMemo(() => pick(entries, "ledger"), [entries]);
  // Once the last duplicate has gone to the trash the "중복 의심" chip disappears, so the list falls back to all documents
  const status = statusPick === "dup" && statusCounts.dup === 0 ? null : statusPick;
  // The box shows every key at once; the list follows a moment later, so typing never waits for it
  // (the list parts below are memoized, so a keystroke itself only redraws the search box)
  const q = useDeferredValue(query);
  const filtered = useMemo(
    () =>
      (view === "ledger" ? list.filter((e) => matches(e.doc, filter, todayBangkok()) && (status === null || (status === "check" ? check.has(e.id) : !!check.get(e.id)?.includes("dup")))) : list).filter((e) =>
        search(e.doc, q),
      ),
    [list, view, filter, q, status, check],
  );
  const months = useMemo(
    () => groupByMonth(filtered).map((g) => ({ group: g, monthEntries: list.filter((e) => monthKey(e.doc) === g.key) })),
    [filtered, list],
  );
  const filtering = filter.stickers.length > 0 || filter.unpaidOnly || !!filter.category || !!filter.period || q.trim() !== "" || status !== null;
  const filterCount = filter.stickers.length + (filter.unpaidOnly ? 1 : 0) + (filter.category ? 1 : 0) + (filter.period ? 1 : 0);
  const thisMonth = monthKey({ date: todayBangkok() });
  const thisMonthEntries = useMemo(() => pick(entries, "ledger").filter((e) => monthKey(e.doc) === thisMonth), [entries, thisMonth]);
  // "Tick all shown": what can be ticked now (unpaid for a payment run; not in a closed month for a category)
  const tickable = useMemo(
    () => (selecting && view === "ledger" ? filtered.filter((e) => (mode === "pay" ? isUnpaid(e.doc) : !locks.has(monthKey(e.doc)))) : []),
    [selecting, view, filtered, mode, locks],
  );
  const allTicked = tickable.length > 0 && tickable.every((e) => selected.has(e.id));
  const startPay = () => {
    setMode("pay");
    setSelecting(true);
    setFilter((f) => ({ ...f, unpaidOnly: true }));
  };
  const startCategory = () => {
    setMode("category");
    setSelecting(true);
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-6">
      {/* One column the width of the screen: a long label (Thai) wraps instead of widening the page */}
      <header className="grid grid-cols-[minmax(0,1fr)] gap-4 [&>*]:min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-3">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">{t("nav.ledger")}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <AddDocButtons size="sm" />
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
        {/* What needs doing, one tap to see just those (owner, 2026-11-06) */}
        {view === "ledger" && counts.ledger > 0 && (statusCounts.check > 0 || statusCounts.unpaid > 0) && (
          <div className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t("archive.status.title")}>
            <StatusChip on={status === "check"} n={statusCounts.check} tone="bad" icon={TriangleAlert} label={t("archive.status.check")} onClick={() => setStatus((s) => (s === "check" ? null : "check"))} />
            <StatusChip
              on={filter.unpaidOnly && status === null}
              n={statusCounts.unpaid}
              tone="warn"
              icon={CircleDollarSign}
              label={t("archive.status.unpaid")}
              onClick={() => (setStatus(null), setFilter((f) => ({ ...f, unpaidOnly: !(f.unpaidOnly && status === null) })))}
            />
            {statusCounts.dup > 0 && <StatusChip on={status === "dup"} n={statusCounts.dup} tone="bad" icon={Copy} label={t("archive.status.dup")} onClick={() => setStatus((s) => (s === "dup" ? null : "dup"))} />}
          </div>
        )}
        {/* One row: search, filters, saved views, export, several at once, more (owner, 2026-11-06: "버튼 정리") */}
        {list.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block min-w-[12rem] flex-1">
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
            {view === "ledger" && !selecting && (
              // Phones: one row of icons (the words stay for screen readers); wider screens: icons with words
              <div className="flex items-center gap-1.5 max-sm:w-full max-sm:justify-between">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant={filterCount ? "default" : "secondary"} className="h-11 rounded-full px-4">
                      <SlidersHorizontal className="size-4" />
                      {t("archive.bar.filter")}
                      {filterCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-background/25 text-[11px] font-bold">{filterCount}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[min(92vw,26rem)] rounded-2xl p-3">
                    <FilterBar filter={filter} onChange={setFilter} entries={list} wrap />
                    {filterCount > 0 && (
                      <button type="button" className="mt-2 text-[13px] font-medium text-primary hover:underline" onClick={() => setFilter({ stickers: [], unpaidOnly: false })}>
                        {t("archive.clear")}
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="secondary" className="h-11 rounded-full px-4 max-sm:px-3.5" title={t("archive.bar.views")}>
                      <Bookmark className="size-4" />
                      <span className="max-sm:sr-only">{t("archive.bar.views")}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[min(92vw,24rem)] rounded-2xl p-3">
                    {/* Saved views: one tap brings back a set of filters and a search (owner, 2026-10-27) */}
                    <SavedViews filter={filter} query={query} onPick={(f, s) => (setStatus(null), setFilter(f), setQuery(s))} inMenu />
                  </PopoverContent>
                </Popover>
                <ExportButtons month={thisMonth} entries={thisMonthEntries} label={t("archive.bar.exportThis")} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="secondary" className="h-11 rounded-full px-4 max-sm:px-3.5" title={t("archive.bar.bulk")}>
                      <ListChecks className="size-4" />
                      <span className="max-sm:sr-only">{t("archive.bar.bulk")}</span>
                      <ChevronDown className="size-3.5 text-muted-foreground max-sm:hidden" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <DropdownMenuItem onSelect={startPay} className="gap-2 py-2.5">
                      <CircleCheck className="size-4" />
                      {t("bulk.start")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={startCategory} className="gap-2 py-2.5">
                      <Tags className="size-4" />
                      {t("bulkCat.start")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="size-11 rounded-full" aria-label={t("archive.bar.more")} title={t("archive.bar.more")}>
                      <Ellipsis className="size-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl">
                    <DropdownMenuItem asChild className="gap-2 py-2.5">
                      <Link href="/ledger/cash">
                        <Coins className="size-4" />
                        {t("cash.link")}
                      </Link>
                    </DropdownMenuItem>
                    {assetCount > 0 && (
                      <DropdownMenuItem asChild className="gap-2 py-2.5">
                        <Link href="/ledger/assets">
                          <Refrigerator className="size-4" />
                          {t("assets.link", { count: assetCount })}
                        </Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            {view === "ledger" && selecting && (
              <Button type="button" variant="secondary" className="h-11 rounded-full px-4" onClick={stopSelecting}>
                <X className="size-4" />
                {t("bulk.stop")}
              </Button>
            )}
          </div>
        )}
        {/* A month without documents still reaches the cash box and the assets */}
        {view === "ledger" && list.length === 0 && loaded && (
          <div className="flex flex-wrap gap-2">
            <Link href="/ledger/cash" className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-primary hover:bg-primary/10">
              <Coins className="size-4" aria-hidden />
              {t("cash.link")}
            </Link>
          </div>
        )}
        {selecting && view === "ledger" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{mode === "pay" ? t("bulk.hint") : t("bulkCat.hint")}</p>
            {tickable.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full px-3.5 text-[13px]"
                onClick={() => setSelected(allTicked ? new Set() : new Set(tickable.map((e) => e.id)))}
              >
                <CircleCheck className="size-4" />
                {allTicked ? t("bulkCat.noneShown") : t("bulkCat.allShown", { count: tickable.length })}
              </Button>
            )}
          </div>
        )}
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
            setStatus(null);
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
      ) : view === "ledger" && status === "dup" && isAdmin ? (
        // "중복 의심": the groups side by side, tick several, one button to the trash (components/ledger/DupReview)
        <DupReview entries={pick(entries, "ledger")} />
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
              key={`${group.key}:${q.trim() !== "" || !!filter.category || status !== null}`}
              group={group}
              defaultOpen={i < 3 || q.trim() !== "" || !!filter.category || status !== null}
              monthEntries={monthEntries}
              check={check}
              locked={locks.has(group.key)}
              dups={isAdmin && !locks.has(group.key) ? dupGroupsIn(savedDocs, group.key) : 0}
              onDups={reviewDups}
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

function FilterBar({ filter, onChange, entries, wrap = false }: { filter: ArchiveFilter; onChange: (f: ArchiveFilter) => void; entries: LedgerEntry[]; wrap?: boolean }) {
  const t = useTranslations("archive");
  const label = useStickerLabel();
  // Categories in use, with how many documents each (a mixed receipt counts under each of its categories)
  const options = useCategoryOptions(filter.category);
  const cats = useMemo(
    () => options.map((o) => ({ ...o, count: entries.filter((e) => hasCategory(e.doc, o.key)).length })).filter((o) => o.count > 0 || o.key === filter.category),
    [options, entries, filter.category],
  );
  const used = STICKERS.filter((c) => entries.some((e) => e.doc.stickers.includes(c)));
  const toggle = (c: Sticker) =>
    onChange({ ...filter, stickers: filter.stickers.includes(c) ? filter.stickers.filter((s) => s !== c) : [...filter.stickers, c] });
  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
      on ? "bg-foreground text-background" : "bg-card text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:text-foreground",
    );
  return (
    // Phones: one row that scrolls sideways, on its own line; min-w-0 so it never widens the page (a long category list)
    <div
      className={wrap ? "flex flex-wrap gap-2" : "-mx-4 flex min-w-0 basis-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:basis-auto sm:flex-wrap sm:px-0"}
      role="group"
      aria-label={t("stickers")}
    >
      <button type="button" aria-pressed={!filter.stickers.length} className={chip(!filter.stickers.length)} onClick={() => onChange({ ...filter, stickers: [] })}>
        {t("stickerAll")}
      </button>
      {used.map((c) => (
        <button key={c} type="button" aria-pressed={filter.stickers.includes(c)} className={chip(filter.stickers.includes(c))} onClick={() => toggle(c)}>
          <StickerDot color={c} />
          {label(c)}
        </button>
      ))}
      {wrap ? <span className="basis-full" aria-hidden /> : <span className="mx-1 w-px flex-none self-stretch bg-border" aria-hidden />}
      <button type="button" aria-pressed={filter.unpaidOnly} className={chip(filter.unpaidOnly)} onClick={() => onChange({ ...filter, unpaidOnly: !filter.unpaidOnly })}>
        {t("unpaidOnly")}
      </button>
      <label className="relative flex-none">
        <span className="sr-only">{t("period")}</span>
        <select
          value={filter.period ?? ""}
          onChange={(e) => onChange({ ...filter, period: e.target.value === "this" || e.target.value === "last" ? e.target.value : undefined })}
          className={cn(chip(!!filter.period), "appearance-none pr-7")}
        >
          <option value="">{t("periodAll")}</option>
          <option value="this">{t("periodThis")}</option>
          <option value="last">{t("periodLast")}</option>
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 opacity-70" aria-hidden />
      </label>
      <label className="relative flex-none">
        <span className="sr-only">{t("categoryFilter")}</span>
        <select
          value={filter.category ?? ""}
          onChange={(e) => onChange({ ...filter, category: e.target.value || undefined })}
          className={cn(chip(!!filter.category), "max-w-[13rem] appearance-none truncate pr-7")}
        >
          <option value="">{t("categoryAll")}</option>
          {cats.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({c.count})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 opacity-70" aria-hidden />
      </label>
    </div>
  );
}

const MonthSection = memo(function MonthSection({
  group,
  defaultOpen,
  monthEntries,
  check,
  locked,
  dups,
  onDups,
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
  /** Possible duplicate groups with a document in this month (the close dialog warns) */
  dups: number;
  onDups: () => void;
  isAdmin: boolean;
  /** Ticking for a payment run ("pay": unpaid only) or for a category ("category": any, closed months excepted) */
  selecting: "pay" | "category" | null;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("archive");
  const tl = useTranslations("lock");
  const tf = useTranslations("filing");
  const me = useMe();
  // The tax return numbers of this month (owner, 2026-11-08: shown next to the export, not inside its menu)
  const canFile = isAdmin && canOpen(me, "sales");
  const monthLabel = useMonthLabel();
  const current = group.key === monthKey({ date: todayBangkok() });
  const td = useTranslations("archive.days");
  const locale = useLocale();
  const dayLabel = (b: DayBucket) =>
    b.kind === "range"
      ? td("range", { month: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${b.month}-01T00:00:00Z`)), from: b.from, to: b.to })
      : td(b.kind);
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
              {isAdmin ? <MonthLockButton month={group.key} label={monthLabel(group.key)} locked={locked} dups={dups} onDups={onDups} /> : <span />}
              <div className="flex flex-wrap items-center gap-2">
                {canFile && (
                  <Link
                    href={`/ledger/filing/${group.key}`}
                    className="press inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.97] pointer-fine:h-9"
                  >
                    <Calculator className="size-4" aria-hidden />
                    {tf("short")}
                  </Link>
                )}
                <ExportButtons month={group.key} entries={monthEntries} />
              </div>
            </div>
          )}
          {/* Rows in date groups: today, yesterday, this week, last week, then weeks of the month (owner, 2026-11-06) */}
          {groupByDays(group.items, (e) => e.doc.date, todayBangkok()).map((g) => (
            <section key={g.key} className="grid gap-2" aria-label={dayLabel(g.bucket)}>
              <h3 className="flex items-baseline justify-between gap-3 px-2 pt-1.5 text-[12.5px] font-semibold text-muted-foreground">
                <span className="flex items-baseline gap-1.5">
                  <span className={cn(g.bucket.kind === "today" && "text-primary")}>{dayLabel(g.bucket)}</span>
                  <span className="font-normal">{t("docs", { count: g.items.length })}</span>
                </span>
                <span className="tabular-nums">{baht(fromSatang(g.items.reduce((a, e) => a + toSatang(e.doc.totals.net), 0)))}</span>
              </h3>
              <ul className="grid gap-2">
                {g.items.map((e) => (
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
            </section>
          ))}
        </div>
      )}
    </details>
  );
});

/** A status on top of the ledger: how many, and a tap shows only those */
function StatusChip({ on, n, tone, icon: Icon, label, onClick }: { on: boolean; n: number; tone: "bad" | "warn"; icon: typeof Copy; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={n === 0 && !on}
      onClick={onClick}
      className={cn(
        "press inline-flex min-h-10 flex-none items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-45",
        on
          ? tone === "bad"
            ? "bg-bad text-white"
            : "bg-warn text-white"
          : tone === "bad"
            ? "bg-bad-soft text-bad hover:bg-bad/15"
            : "bg-warn-soft text-warn hover:bg-warn/15",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
      <span className={cn("min-w-6 rounded-full px-1.5 text-center text-[12px] tabular-nums", on ? "bg-white/25" : "bg-card")}>{n}</span>
    </button>
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

/** The seller as printed (English, else Thai); without one, the document number or its first item line (useDocName) */
const sellerOf = (e: LedgerEntry, name: (d: LedgerEntry["doc"]) => string) => joinTri(e.doc.seller.name, "en") || joinTri(e.doc.seller.name, "th") || name(e.doc);

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
  const isAdmin = useMe().role === "admin";
  const docName = useDocName();
  const setStickers = async (stickers: Sticker[]) => {
    await setQuick(e.id, { stickers });
  };
  const flagged = !!open?.length;
  const accepted = !flagged && e.ackFlags.length > 0;
  // The office has not looked at it yet (admins see this; the dashboard lists them)
  const unchecked = isAdmin && !draft && e.checkedAt === null;
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
          aria-label={sellerOf(e, docName)}
          className="ml-3 size-5 flex-none rounded-md"
        />
      )}
      <Link href={`/documents/${e.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-2.5 sm:gap-4 sm:p-3">
        <Thumb path={e.photoPath} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            {/* Long vendor names wrap to a second line instead of being cut */}
            <span className="line-clamp-2 text-[15px] leading-snug font-semibold break-words">{sellerOf(e, docName)}</span>
            {draft && <span className="flex-none rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">{t("archive.draftBadge")}</span>}
            {/* Wider screens: the amount beside the name; phones: on the line below, so the name has the width */}
            <span className="ml-auto flex-none text-[15px] font-semibold whitespace-nowrap tabular-nums max-sm:hidden">{baht(e.doc.totals.net)}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs whitespace-nowrap text-muted-foreground">
            <span className="text-[15px] font-semibold text-foreground tabular-nums sm:hidden">{baht(e.doc.totals.net)}</span>
            <span className="font-medium text-foreground/70">{t(`docTypeShort.${e.doc.docType}`)}</span>
            {e.doc.docNo && <span className="mono max-sm:hidden">{e.doc.docNo}</span>}
            <BranchTag id={e.doc.branchId} />
            {e.doc.date && <span>{sd(e.doc.date)}</span>}
            {draft && <span className="font-medium">{monthLabel(monthKey(e.doc))}</span>}
            {isUnpaid(e.doc) && !draft && <span className="text-warn">{t("app.unpaid")}</span>}
            {unchecked && <span className="font-medium text-primary">{t("archive.unchecked")}</span>}
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
      {/* "문제 없음": in the row itself — a round check on phones, with its words on wider screens */}
      {flagged && !draft && (
        <button
          type="button"
          onClick={() => void accept()}
          aria-label={t("ack.button")}
          className="press grid size-10 flex-none place-items-center rounded-full border border-input bg-background text-xs font-medium hover:bg-muted sm:flex sm:h-8 sm:w-auto sm:items-center sm:gap-1 sm:px-2.5"
          title={t("ack.hint")}
        >
          <Check className="size-4 text-ok sm:size-3.5 sm:text-current" aria-hidden />
          <span className="max-sm:hidden">{t("ack.button")}</span>
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
  const docName = useDocName();
  const [busy, setBusy] = useState(false);
  const when = e.deletedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(e.deletedAt) : "";
  return (
    <li className={cn("workspace-panel grid gap-3 p-3 sm:p-4", checked && "ring-2 ring-primary")}>
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {selectable && <Checkbox checked={!!checked} onCheckedChange={() => onToggle?.(e.id)} aria-label={sellerOf(e, docName)} className="size-5 flex-none rounded-md" />}
        <span className="flex-none opacity-60 grayscale">
          <Thumb path={e.photoPath} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-muted-foreground line-through decoration-1">{sellerOf(e, docName)}</span>
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
        {!selectable && <PurgeButton ids={[e.id]} name={sellerOf(e, docName)} />}
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
