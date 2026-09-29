"use client";

import {
  Building2,
  ChevronDown,
  FolderClosed,
  List,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useScreenDate } from "@/components/ScreenDate";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportLang } from "@/lib/export";
import { useLedger } from "@/lib/ledger-store";
import { baht, fromSatang, toSatang } from "@/lib/money";
import { digitsOnly } from "@/lib/thai-tax";
import { FORM_LANGS, type Tri } from "@/lib/types";
import { useMe } from "@/lib/role-store";
import { deleteVendor, saveVendorName, useVendors } from "@/lib/vendor-store";
import { type Vendor, vendorCategory } from "@/lib/vendors";
import { CategoryIcon, useCategoryLabel } from "./CategoryIcon";
import { VendorRule } from "./VendorRule";

type Stat = { count: number; satang: number; last: string; cats: string[] };

type View = "folders" | "list";
const VIEW_KEY = "vendors-view";

/**
 * Vendor dictionary: every seller seen in saved documents, with their ledger totals. Shown as folders — vendors of
 * the same category behind one icon, opened large in the middle of the screen (owner's choice, 2026-09-29) — or as
 * the plain list. A search always shows the list.
 */
export function VendorList() {
  const t = useTranslations("vendors");
  const locale = useLocale();
  const lang = exportLang(locale);
  const { vendors, loaded } = useVendors();
  const { entries } = useLedger();
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("folders");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {}
  }, []);
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // Documents in the ledger (not drafts, not trash) per vendor tax ID
  const stats = useMemo(() => {
    const m = new Map<
      string,
      Stat & { seen: { date: string; cat: string }[] }
    >();
    for (const e of entries) {
      if (e.deletedAt !== null || e.status !== "final") continue;
      const key = digitsOnly(e.doc.seller.taxId);
      const s = m.get(key) ?? {
        count: 0,
        satang: 0,
        last: "",
        cats: [],
        seen: [],
      };
      s.seen.push({ date: e.doc.date, cat: e.doc.category });
      s.count += 1;
      s.satang += toSatang(e.doc.totals.net);
      if (e.doc.date > s.last) s.last = e.doc.date;
      m.set(key, s);
    }
    // newest first, so a tie between categories goes to the latest one
    for (const s of m.values())
      s.cats = s.seen
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((x) => x.cat);
    return m;
  }, [entries]);

  const needle = q.trim().toLowerCase();
  const list = vendors
    .filter(
      (v) =>
        !needle ||
        v.taxId.includes(needle.replace(/\D/g, "") || "∅") ||
        FORM_LANGS.some((l) => v.name[l].toLowerCase().includes(needle)),
    )
    .sort((a, b) =>
      (stats.get(b.taxId)?.last ?? "").localeCompare(
        stats.get(a.taxId)?.last ?? "",
      ),
    );

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">
          {t("title")}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("hint")}
        </p>
      </header>
      {vendors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-0 flex-1 basis-60 sm:max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-11 rounded-full pl-10"
          />
        </label>
        <div className="flex rounded-full bg-muted p-1" role="group" aria-label={t("view")}>
          {(["folders", "list"] as const).map((v) => {
            const Icon = v === "folders" ? FolderClosed : List;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => pickView(v)}
                className={cn("flex h-9 items-center gap-1.5 rounded-full px-3 text-sm", view === v ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
              >
                <Icon className="size-4" aria-hidden />
                {t(v === "folders" ? "viewFolders" : "viewList")}
              </button>
            );
          })}
        </div>
        </div>
      )}
      {!loaded ? (
        <Loader2
          className="mx-auto mt-10 size-6 animate-spin text-muted-foreground"
          aria-label="Loading"
        />
      ) : list.length === 0 ? (
        <div className="workspace-panel grid justify-items-center gap-4 px-6 py-16 text-center">
          <span className="intelligence-mark is-soft size-14 text-muted-foreground">
            <Building2 className="size-6" aria-hidden />
          </span>
          <p className="text-[15px] text-muted-foreground">
            {vendors.length ? t("noMatch") : t("empty")}
          </p>
        </div>
      ) : view === "folders" && !needle ? (
        <Folders list={list} stats={stats} lang={lang} />
      ) : (
        // One slim panel with a line per vendor (tap a line for its rule, rename and delete)
        <ul className="workspace-panel divide-y divide-border/60 overflow-hidden p-0">
          {list.map((v) => (
            <VendorRow key={v.id} v={v} lang={lang} stat={stats.get(v.taxId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Vendors grouped by category, like folders on a phone's home screen; a tap opens one large in the middle */
function Folders({ list, stats, lang }: { list: Vendor[]; stats: Map<string, Stat>; lang: "th" | "en" | "ja" }) {
  const t = useTranslations("vendors");
  const catLabel = useCategoryLabel();
  const [open, setOpen] = useState<string | null>(null);
  const folders = useMemo(() => {
    const by = new Map<string, Vendor[]>();
    for (const v of list) {
      const k = vendorCategory(v.ruleCategory, stats.get(v.taxId)?.cats ?? []);
      by.set(k, [...(by.get(k) ?? []), v]);
    }
    // Biggest folders first; within one, the latest vendor first (the list's order)
    return [...by.entries()]
      .map(([key, vendors]) => ({ key, vendors, satang: vendors.reduce((a, v) => a + (stats.get(v.taxId)?.satang ?? 0), 0) }))
      .sort((a, b) => b.vendors.length - a.vendors.length || b.satang - a.satang);
  }, [list, stats]);
  const current = folders.find((f) => f.key === open) ?? null;
  const nameOf = (v: Vendor) => v.name[lang] || v.name.en || v.name.th || "—";

  return (
    <>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {folders.map((f) => (
          <li key={f.key}>
            <button
              type="button"
              onClick={() => setOpen(f.key)}
              aria-haspopup="dialog"
              aria-label={`${catLabel(f.key)} · ${t("folderCount", { count: f.vendors.length })}`}
              className="press workspace-panel hover-lift [--lift:1.03] grid w-full justify-items-center gap-2 p-3 text-center sm:p-4"
            >
              <span className="relative">
                <CategoryIcon category={f.key} className="size-16 rounded-[1.35rem] sm:size-[4.5rem]" />
                <span className="absolute -top-1.5 -right-1.5 grid min-w-6 place-items-center rounded-full bg-foreground px-1.5 text-[11px] leading-6 font-semibold text-background tabular-nums shadow-sm">
                  {f.vendors.length}
                </span>
              </span>
              <span className="w-full truncate text-[13px] font-semibold">{catLabel(f.key)}</span>
              {/* A peek inside: the first vendors' initials */}
              <span className="flex -space-x-1.5" aria-hidden>
                {f.vendors.slice(0, 4).map((v) => (
                  <span key={v.id} className="grid size-5 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
                    {Array.from(nameOf(v).trim())[0]?.toUpperCase() ?? "•"}
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        {current && (
          <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-[2rem] p-0 sm:max-w-lg" data-lenis-prevent>
            <DialogHeader className="grid justify-items-center gap-2 px-6 pt-7 pb-2 text-center">
              <CategoryIcon category={current.key} className="size-16 rounded-[1.35rem]" />
              <DialogTitle className="text-xl">{catLabel(current.key)}</DialogTitle>
              <DialogDescription className="tabular-nums">
                {t("folderCount", { count: current.vendors.length })} · {t("total")} {baht(fromSatang(current.satang))}
              </DialogDescription>
            </DialogHeader>
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {current.vendors.map((v) => (
                <VendorRow key={v.id} v={v} lang={lang} stat={stats.get(v.taxId)} />
              ))}
            </ul>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function VendorRow({
  v,
  lang,
  stat,
}: {
  v: Vendor;
  lang: "th" | "en" | "ja";
  stat?: Stat;
}) {
  const t = useTranslations("vendors");
  const sd = useScreenDate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState<Tri>(v.name);
  const [busy, setBusy] = useState(false);
  const shown = v.name[lang] || v.name.en || v.name.th;
  const branch = v.branch[lang] || v.branch.en || v.branch.th;
  const isAdmin = useMe().role === "admin";
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState(false);
  const ruled = !!(v.ruleCategory || v.rulePayment || v.autoRegister);
  const remove = async () => {
    setBusy(true);
    try {
      await deleteVendor(v.id);
      toast.success(t("deleted"));
      setAsking(false);
    } catch {
      toast.error(t("deleteFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:px-5"
      >
        <CategoryIcon
          category={vendorCategory(v.ruleCategory, stat?.cats ?? [])}
        />
        <span className="grid min-w-0 gap-0.5">
          {/* Long names wrap to a second line instead of being cut */}
          <span className="line-clamp-2 text-[15px] leading-snug font-semibold break-words">
            {shown || "—"}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {ruled && (
              <Wand2
                className="size-3 flex-none text-brand"
                aria-label={t("rule")}
              />
            )}
            <span className="truncate">
              {[lang !== "th" ? v.name.th : "", branch]
                .filter(Boolean)
                .join(" · ") || v.taxId}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="grid text-right">
            <span className="text-[15px] font-semibold whitespace-nowrap tabular-nums">
              {baht(fromSatang(stat?.satang ?? 0))}
            </span>
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {t("docs", { count: stat?.count ?? 0 })}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>
      {open && (
        <div className="grid gap-3 px-4 pb-4 sm:px-5 sm:pl-[68px]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="mono">{v.taxId}</span>
            {stat?.last && <span>· {t("last", { date: sd(stat.last) })}</span>}
            <span className="ml-auto flex gap-1">
              {!editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" />
                  {t("edit")}
                </Button>
              )}
              {!editing && isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3 text-muted-foreground hover:text-bad"
                  onClick={() => setAsking(true)}
                >
                  <Trash2 className="size-3.5" />
                  {t("delete")}
                </Button>
              )}
            </span>
          </p>
          <VendorRule v={v} />
          <AlertDialog
            open={asking}
            onOpenChange={(o) => !busy && setAsking(o)}
          >
            <AlertDialogContent className="rounded-3xl sm:max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("deleteTitle", { name: shown || v.taxId })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteDesc", { count: stat?.count ?? 0 })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">
                  {t("cancel")}
                </AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {t("delete")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {editing && (
            <form
              className="grid gap-2 rounded-2xl bg-muted/50 p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await saveVendorName(v.id, {
                    th: name.th.trim(),
                    en: name.en.trim(),
                    ja: name.ja.trim(),
                  });
                  toast.success(t("saved"));
                  setEditing(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {FORM_LANGS.map((l) => (
                <label
                  key={l}
                  className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-2"
                >
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                    {l}
                  </span>
                  <Input
                    lang={l}
                    value={name[l]}
                    onChange={(e) => setName({ ...name, [l]: e.target.value })}
                    aria-label={`${t("edit")} ${l}`}
                    className="h-9"
                  />
                </label>
              ))}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => (setName(v.name), setEditing(false))}
                >
                  ✕
                </Button>
                <Button type="submit" className="rounded-full" disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {t("save")}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
