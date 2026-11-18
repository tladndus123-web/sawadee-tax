"use client";

// "새 기능 안내" (owner 2026-11-18): a one-time notice of what changed. Everyone who has not seen it gets it once after
// signing in; "확인했어요" (or closing it) marks it seen in their sign-in (lib/user-prefs, same on every device), so it
// never shows again. Admins get the full list, staff only what they use. For the next notice: a new NOTICE key and texts.
// Look (owner: "심플하고 클린하게, 깔끔하고 담백한 느낌"): white, the app icon small at the top, plain rows with thin lines.

import { Banknote, FileSignature, LayoutPanelLeft, ReceiptText, Sparkles, TableProperties, UtensilsCrossed, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppMark } from "@/components/layout/app-mark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useMe } from "@/lib/role-store";
import { usePref } from "@/lib/user-prefs";

const NOTICE = "notice-2026-11-18";

const ADMIN = [
  { key: "claims", icon: ReceiptText },
  { key: "pl", icon: TableProperties },
  { key: "contracts", icon: FileSignature },
  { key: "food", icon: UtensilsCrossed },
  { key: "ai", icon: Sparkles },
  { key: "cash", icon: Banknote },
  { key: "menu", icon: LayoutPanelLeft },
] as const;
const STAFF = [
  { key: "cash", icon: Banknote },
  { key: "menu", icon: LayoutPanelLeft },
] as const;

export function WhatsNew() {
  const t = useTranslations("whatsNew");
  const me = useMe();
  // Until the sign-in is read the notice counts as seen, so it never flashes for someone who saw it
  const [seen, setSeen] = usePref<boolean>(NOTICE, (v) => v === true, true);
  if (!me.loaded || !me.userId || seen) return null;
  const items = me.role === "admin" ? ADMIN : STAFF;
  return (
    <Dialog open onOpenChange={(open) => !open && setSeen(true)}>
      <DialogContent showCloseButton={false} className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 shadow-xl sm:max-w-[440px]">
        <div className="relative flex-none px-6 pt-6 pb-4">
          <DialogClose className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-fine:size-9" aria-label={t("ok")}>
            <X className="size-[18px]" aria-hidden />
          </DialogClose>
          <AppMark className="size-10" />
          <p className="mt-4 text-[12.5px] font-medium text-muted-foreground">{t("badge")}</p>
          <DialogTitle className="mt-0.5 text-[21px] leading-tight font-semibold tracking-[-0.02em]">{t("title")}</DialogTitle>
          <DialogDescription className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{me.role === "admin" ? t("introAdmin") : t("introStaff")}</DialogDescription>
        </div>

        <ul className="min-h-0 divide-y divide-border/70 overflow-y-auto overscroll-contain border-y border-border/70 px-6">
          {items.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3.5 py-3">
              <Icon className="mt-0.5 size-[18px] flex-none text-primary" strokeWidth={1.8} aria-hidden />
              <div className="grid min-w-0 gap-0.5">
                <p className="text-[14.5px] leading-snug font-medium">{t(`${key}.title`)}</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{t(`${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex-none px-6 py-4">
          <Button type="button" className="h-11 w-full rounded-full text-[14.5px]" onClick={() => setSeen(true)}>
            {t("ok")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
