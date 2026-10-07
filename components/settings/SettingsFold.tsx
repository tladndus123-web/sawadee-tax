"use client";

import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EVENT = "settings-folds";

type Tone = "ok" | "warn" | "bad" | "brand";
type Status = { text: string; on?: boolean; tone?: Tone } | null;
const StatusContext = createContext<(s: Status) => void>(() => {});

/** A card inside a fold shows a short state on the folded row ("3곳", "연결됨"); on = a green dot, tone = a pill */
export function useFoldStatus(text: string | null | undefined, on?: boolean, tone?: Tone) {
  const set = useContext(StatusContext);
  useEffect(() => {
    set(text ? { text, on, tone } : null);
  }, [set, text, on, tone]);
}

const PILL: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  brand: "bg-brand-soft text-brand",
};

/**
 * One settings section folded to a single row (icon + title); tapping slides the card open.
 * The card inside keeps its own content; its panel frame and its title (id ending in "-title") are
 * taken over by the fold. A card that renders nothing (admin-only for staff) hides the whole row.
 * A link to one of the card's ids (/settings#fixed-title) opens it.
 */
export function SettingsFold({
  icon,
  title,
  children,
  row = false,
  status: given,
  lazy = false,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  /** A line inside a card (dashboard "할 일") instead of a card of its own */
  row?: boolean;
  /** The folded row's state, when the page knows it (else the card inside reports it) */
  status?: Status;
  /** Build the inside only once first opened (its code loads then too); for rows whose status the page gives */
  lazy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  if (open && !seen) setSeen(true);
  const [reported, setStatus] = useState<Status>(null);
  const status = given ?? reported;
  const body = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const byHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const target = hash && body.current?.querySelector(`[id="${CSS.escape(hash)}"]`);
      if (!target) return;
      setOpen(true);
      window.setTimeout(() => body.current?.parentElement?.scrollIntoView({ block: "start", behavior: "smooth" }), 80);
    };
    const all = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    byHash();
    window.addEventListener("hashchange", byHash);
    window.addEventListener(EVENT, all);
    return () => {
      window.removeEventListener("hashchange", byHash);
      window.removeEventListener(EVENT, all);
    };
  }, []);

  return (
    <div
      className={cn(
        "min-w-0 scroll-mt-24 has-[[data-fold-body]:empty]:hidden",
        row ? "border-b border-border/60 last:border-0" : "workspace-panel hover-lift [--lift:1.006]",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 text-left font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
          row ? "min-h-14 rounded-xl px-1 text-[15px]" : "min-h-16 rounded-[inherit] px-5 text-lg sm:px-6",
        )}
      >
        <span className="flex [&>svg]:size-5" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {status && (
          <span
            className={cn(
              "flex max-w-[55%] flex-none items-center gap-1.5 truncate text-xs font-medium tabular-nums",
              status.tone ? cn("rounded-full px-2.5 py-1 font-semibold", PILL[status.tone]) : "text-muted-foreground",
            )}
          >
            {status.on && <span className="size-1.5 flex-none rounded-full bg-ok" aria-hidden />}
            <span className="truncate">{status.text}</span>
          </span>
        )}
        <ChevronDown
          className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <div
        id={id}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        inert={!open}
      >
        <div
          ref={body}
          data-fold-body
          className={cn(
            "min-h-0 overflow-hidden",
            // the card's own frame, lift and title belong to the fold now
            "[&>*]:rounded-none [&>*]:border-0 [&>*]:bg-transparent [&>*]:[box-shadow:none] [&>*]:[scale:none]",
            "[&_h2[id$='-title']]:sr-only",
            // a line inside a card: the card inside loses its own padding too
            row ? "[&>*]:px-1! [&>*]:pt-0! [&>*]:pb-4!" : "[&>*]:pt-1 [&>div]:px-5 [&>div]:pb-5 sm:[&>div]:px-6 sm:[&>div]:pb-6",
          )}
        >
          {/* Not built yet: a placeholder, so the row is not taken for an empty card and hidden */}
          {lazy && !seen ? <div aria-hidden /> : <StatusContext.Provider value={setStatus}>{children}</StatusContext.Provider>}
        </div>
      </div>
    </div>
  );
}

/** Open or close every section at once */
export function FoldAllButton() {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: !open }));
        setOpen(!open);
      }}
      className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {open ? <ChevronsDownUp className="size-4" aria-hidden /> : <ChevronsUpDown className="size-4" aria-hidden />}
      {open ? t("collapseAll") : t("expandAll")}
    </button>
  );
}
