"use client";

// "Edit cards" on the dashboard (owner, 2026-10-27): each card up or down, shown or hidden, and back to the usual.

import { ArrowDown, ArrowUp, Eye, EyeOff, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ADMIN_ONLY, DEFAULT_LAYOUT, type DashLayout, moveCard, toggleCard } from "@/lib/dash-layout";
import { cn } from "@/lib/utils";

export function DashEditor({ layout, onChange, isAdmin }: { layout: DashLayout; onChange: (l: DashLayout) => void; isAdmin: boolean }) {
  const t = useTranslations("dash.cards");
  const [open, setOpen] = useState(false);
  const order = layout.order.filter((c) => isAdmin || !ADMIN_ONLY.has(c));
  return (
    <>
      <Button type="button" variant="ghost" className="h-11 rounded-full px-4 text-muted-foreground" onClick={() => setOpen(true)}>
        <LayoutGrid className="size-4" />
        {t("edit")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("sub")}</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-1.5">
            {order.map((c, i) => {
              const hidden = layout.hidden.includes(c);
              return (
                <li key={c} className={cn("flex items-center gap-2 rounded-2xl bg-muted/60 py-1.5 pr-1.5 pl-4", hidden && "opacity-55")}>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t(c)}</span>
                  <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" disabled={i === 0} aria-label={t("up")} onClick={() => onChange(moveCard(layout, c, -1))}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" disabled={i === order.length - 1} aria-label={t("down")} onClick={() => onChange(moveCard(layout, c, 1))}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" aria-pressed={!hidden} aria-label={hidden ? t("show") : t("hide")} onClick={() => onChange(toggleCard(layout, c))}>
                    {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4 text-primary" />}
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="text-[12px] text-muted-foreground">{t("note")}</p>
          <DialogFooter>
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => onChange(DEFAULT_LAYOUT)}>
              {t("reset")}
            </Button>
            <Button type="button" className="rounded-full px-6" onClick={() => setOpen(false)}>
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
