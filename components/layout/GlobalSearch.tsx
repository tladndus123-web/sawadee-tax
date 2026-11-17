"use client";

// The PC top bar's search (owner 2026-11-18, from the for-sale version): a field-like button (or "/") opens a window
// that finds, as one types, the menus this person may open, ledger documents (number or seller) and suppliers — five of
// each, newest documents first. The queries use the person's own session, so the database's rules (branches kept out,
// staff limits) decide what comes back. Pure parts: lib/top-search.

import { Building2, CornerDownLeft, FileText, Loader2, Search, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Link, useRouter } from "@/i18n/navigation";
import type { NavItem } from "@/lib/nav-menu";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ilikeAny, matchMenu, nameOf, opensSearch, searchTerm } from "@/lib/top-search";
import { cn } from "@/lib/utils";
import { NAV_ICON } from "./nav-icons";

type Kind = "menu" | "docs" | "vendors";
type Hit = { href: string; title: string; sub: string; kind: Kind; icon?: (typeof NAV_ICON)[keyof typeof NAV_ICON] };
const KIND_ICON = { docs: FileText, vendors: Building2 } as const;
type AiResult = { q: string; explain: string; count: number; shownTotal: number; docs: { id: string; docNo: string; date: string | null; seller: Record<string, string>; net: number; paid: boolean }[] };

export function GlobalSearch({ items }: { items: NavItem[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  // AI search ("말로 찾기", lib/ai-search): a sentence → a ledger filter → documents (the caller's own rules)
  const [ai, setAi] = useState<AiResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFail, setAiFail] = useState("");
  const askAi = async () => {
    const text = q.trim();
    if (text.length < 2 || aiBusy) return;
    setAiBusy(true);
    setAiFail("");
    try {
      const res = await fetch("/api/search/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: text, lang: locale }) });
      const body = (await res.json().catch(() => ({}))) as { filter?: { explain: string }; docs?: AiResult["docs"]; count?: number; shownTotal?: number; error?: string };
      if (!res.ok || !body.docs) {
        setAi(null);
        setAiFail(body.error === "none" ? t("topSearch.aiNone") : body.error === "rate" ? t("topSearch.aiRate") : t("topSearch.aiFail"));
        return;
      }
      setAi({ q: text, explain: body.filter?.explain ?? "", count: body.count ?? body.docs.length, shownTotal: body.shownTotal ?? 0, docs: body.docs });
    } catch {
      setAiFail(t("topSearch.aiFail"));
    } finally {
      setAiBusy(false);
    }
  };
  const has = (href: string) => items.some((i) => i.href === href);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!opensSearch(e)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const menus = useMemo<Hit[]>(
    () =>
      matchMenu(items, q, (i) => `${t(`nav.${i.key}`)} ${t(`nav.group.${i.group}`)}`)
        .slice(0, 5)
        .map((i) => ({ href: i.href, title: t(`nav.${i.key}`), sub: t(`nav.group.${i.group}`), kind: "menu", icon: NAV_ICON[i.key] })),
    [items, q, t],
  );

  useEffect(() => {
    const term = searchTerm(q);
    const n = ++seq.current;
    if (!term) {
      setFound([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = window.setTimeout(async () => {
      const sb = supabaseBrowser();
      const asks: Promise<Hit[]>[] = [];
      if (has("/ledger"))
        asks.push(
          Promise.resolve(
            sb
              .from("documents")
              .select("id, doc_no, doc_date, seller, net")
              .is("deleted_at", null)
              .or(ilikeAny(["doc_no", "seller->name->>en", "seller->name->>th", "seller->name->>ja"], term))
              .order("doc_date", { ascending: false, nullsFirst: false })
              .limit(5),
          ).then(({ data }) =>
            (data ?? []).map((d) => ({
              href: `/documents/${d.id}`,
              title: nameOf((d.seller as { name?: unknown } | null)?.name, locale) || String(d.doc_no ?? ""),
              sub: [d.doc_no, d.doc_date, d.net != null ? `฿${Number(d.net).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : ""].filter(Boolean).join(" · "),
              kind: "docs" as const,
            })),
          ),
        );
      if (has("/vendors"))
        asks.push(
          Promise.resolve(sb.from("vendors").select("id, name, tax_id").or(ilikeAny(["name->>en", "name->>th", "name->>ja", "tax_id"], term)).limit(5)).then(({ data }) =>
            (data ?? []).map((v) => ({ href: "/vendors", title: nameOf(v.name, locale) || String(v.tax_id ?? ""), sub: String(v.tax_id ?? ""), kind: "vendors" as const })),
          ),
        );
      const lists = await Promise.all(asks.map((a) => a.catch(() => [] as Hit[])));
      if (n !== seq.current) return; // a newer search started
      setFound(lists.flat());
      setBusy(false);
    }, 250);
    return () => window.clearTimeout(timer);
    // `has` reads items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, items, locale]);

  const hits = [...menus, ...found];
  const groups = (["menu", "docs", "vendors"] as const).map((k) => ({ k, list: hits.filter((h) => h.kind === k) })).filter((g) => g.list.length);
  const close = () => {
    setOpen(false);
    setQ("");
    setAi(null);
    setAiFail("");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("topSearch.open")} className="press relative grid size-10 place-items-center rounded-full after:absolute after:-inset-1 md:hidden">
        <Search className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("topSearch.open")}
        className="press hidden h-10 w-full max-w-md min-w-0 items-center gap-2.5 rounded-full border border-border bg-card/80 px-4 text-left text-[14px] text-muted-foreground shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors hover:border-primary/40 hover:bg-card md:flex"
      >
        <Search className="size-4 flex-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t("topSearch.placeholder")}</span>
        <kbd className="flex-none rounded-md border border-border bg-muted px-1.5 font-sans text-[11px] leading-5 text-muted-foreground">/</kbd>
      </button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent showCloseButton={false} className="top-[12vh] translate-y-0 gap-0 overflow-hidden rounded-[22px] p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">{t("topSearch.open")}</DialogTitle>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const first = hits[0];
              if (first) {
                router.push(first.href);
                close();
              }
            }}
            className="flex items-center gap-3 border-b border-border px-4"
          >
            {busy ? <Loader2 className="size-5 flex-none animate-spin text-muted-foreground" aria-hidden /> : <Search className="size-5 flex-none text-muted-foreground" aria-hidden />}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("topSearch.placeholder")}
              aria-label={t("topSearch.placeholder")}
              className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
            />
            <kbd className="flex-none rounded-md border border-border bg-muted px-1.5 font-sans text-[11px] leading-5 text-muted-foreground">Esc</kbd>
          </form>
          <div className="max-h-[min(60vh,520px)] overflow-y-auto p-2" aria-live="polite">
            {q.trim().length >= 2 && (
              <button
                type="button"
                disabled={aiBusy}
                onClick={() => void askAi()}
                className="mb-1 flex w-full items-center gap-3 rounded-xl bg-brand-soft/60 px-3 py-2.5 text-left outline-none hover:bg-brand-soft focus-visible:bg-brand-soft"
              >
                <span className="grid size-9 flex-none place-items-center rounded-xl bg-brand text-white">
                  {aiBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-[14px] font-semibold text-brand">{t("topSearch.ai", { q: q.trim() })}</span>
                  <span className="truncate text-[12px] text-muted-foreground">{t("topSearch.aiHint")}</span>
                </span>
              </button>
            )}
            {aiFail && <p className="px-3 py-2 text-[13px] text-bad">{aiFail}</p>}
            {ai && ai.q === q.trim() && (
              <section className="grid gap-0.5 py-1">
                <h3 className="px-3 pt-1 pb-1 text-[12px] font-semibold text-brand">
                  {ai.explain || t("topSearch.aiTitle")} · {t("topSearch.aiCount", { count: ai.count, total: `฿${ai.shownTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}` })}
                </h3>
                {ai.docs.length === 0 && <p className="px-3 py-3 text-[13px] text-muted-foreground">{t("topSearch.none")}</p>}
                {ai.docs.map((d) => (
                  <Link key={d.id} href={`/documents/${d.id}`} onClick={close} className="flex items-center gap-3 rounded-xl px-3 py-2 outline-none hover:bg-muted focus-visible:bg-muted">
                    <span className="grid size-9 flex-none place-items-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="size-4" aria-hidden />
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-[14px] font-medium">{nameOf(d.seller, locale) || d.docNo}</span>
                      <span className="truncate text-[12px] text-muted-foreground tabular-nums">{[d.docNo, d.date, d.paid ? "" : t("topSearch.unpaid")].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex-none text-[13.5px] font-semibold tabular-nums">฿{d.net.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                  </Link>
                ))}
              </section>
            )}
            {!q.trim() && <p className="px-3 py-6 text-center text-[13.5px] text-muted-foreground">{t("topSearch.hint")}</p>}
            {q.trim() && !groups.length && !(ai && ai.q === q.trim()) && <p className="px-3 py-6 text-center text-[13.5px] text-muted-foreground">{busy ? t("topSearch.searching") : t("topSearch.none")}</p>}
            {groups.map(({ k, list }) => (
              <section key={k} className="grid gap-0.5 py-1">
                <h3 className="px-3 pt-1 pb-1 text-[12px] font-semibold text-muted-foreground">{t(`topSearch.${k}`)}</h3>
                {list.map((h, i) => {
                  const Icon = h.icon ?? (h.kind === "menu" ? Search : KIND_ICON[h.kind]);
                  const first = hits[0] === h;
                  return (
                    <Link key={`${h.href}-${i}`} href={h.href} onClick={close} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 outline-none hover:bg-muted focus-visible:bg-muted", first && "bg-muted/60")}>
                      <span className="grid size-9 flex-none place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-[14px] font-medium">{h.title}</span>
                        {h.sub && <span className="truncate text-[12px] text-muted-foreground tabular-nums">{h.sub}</span>}
                      </span>
                      {first && <CornerDownLeft className="size-4 flex-none text-muted-foreground" aria-hidden />}
                    </Link>
                  );
                })}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
