"use client";

// Saved ledger views (owner, 2026-10-27): chips that bring back a set of filters and a search with one tap; "save this
// view" names what is on screen now; a long press or the × in edit mode removes one. Per person, on every device
// (lib/ledger-views, lib/user-prefs).

import { Bookmark, BookmarkPlus, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { ArchiveFilter } from "@/lib/archive";
import { addView, isOn, readViews, type SavedView } from "@/lib/ledger-views";
import { usePref } from "@/lib/user-prefs";
import { cn } from "@/lib/utils";

const NONE: SavedView[] = [];

export function SavedViews({ filter, query, onPick }: { filter: ArchiveFilter; query: string; onPick: (f: ArchiveFilter, q: string) => void }) {
  const t = useTranslations("archive.views");
  const [views, setViews] = usePref<SavedView[]>("ledgerViews", readViews, NONE);
  const [editing, setEditing] = useState(false);
  const somethingOn = filter.stickers.length > 0 || filter.unpaidOnly || !!filter.category || !!filter.period || query.trim() !== "";
  const current = views.find((v) => isOn(v, filter, query));

  const save = () => {
    const name = window.prompt(t("namePrompt"), "")?.trim();
    if (!name) return;
    setViews(addView(views, name, filter, query));
    toast.success(t("saved", { name }));
  };

  if (!views.length && !somethingOn) return null;
  return (
    <div className="-mx-4 flex w-full gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t("title")}>
      {views.map((v) => (
        <span key={v.name} className="flex flex-none items-center">
          <button
            type="button"
            aria-pressed={current === v}
            onClick={() => (current === v ? onPick({ stickers: [], unpaidOnly: false }, "") : onPick(v.filter, v.query))}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
              current === v ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/15",
              editing && "rounded-r-none pr-2",
            )}
          >
            <Bookmark className="size-3.5" aria-hidden />
            {v.name}
          </button>
          {editing && (
            <button
              type="button"
              aria-label={t("remove", { name: v.name })}
              onClick={() => setViews(views.filter((w) => w.name !== v.name))}
              className="inline-flex min-h-9 items-center rounded-r-full bg-bad-soft px-2 text-bad"
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      ))}
      {somethingOn && !current && (
        <button type="button" onClick={save} className="inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-3 text-[13px] font-medium text-primary hover:bg-primary/5">
          <BookmarkPlus className="size-3.5" aria-hidden />
          {t("save")}
        </button>
      )}
      {views.length > 0 && (
        <button type="button" onClick={() => setEditing((e) => !e)} aria-pressed={editing} className="inline-flex min-h-9 flex-none items-center gap-1 rounded-full px-2.5 text-[12px] text-muted-foreground hover:text-foreground">
          <Pencil className="size-3.5" aria-hidden />
          {editing ? t("done") : t("edit")}
        </button>
      )}
    </div>
  );
}
