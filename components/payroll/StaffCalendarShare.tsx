"use client";

// Share the work schedule (owner, 2026-11-06: "직원용 캘린더 (출근 관련) 캘린더로 공유하기 쉽게"): one subscription address
// for everyone and one per person (lib/calendar-feed-server staffFeedIcs) — sent by LINE, the phone's share sheet,
// copied, or scanned as a QR code from this screen. The phone calendar then shows work days, days off and leave, and
// updates by itself. The address carries a secret that can be renewed.

import { CalendarSync, Copy, Loader2, MessageCircle, QrCode, RefreshCw, Share2, TriangleAlert, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Employee } from "@/lib/payroll";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function StaffCalendarShare({ employees, onClose }: { employees: Employee[]; onClose: () => void }) {
  const t = useTranslations("feed");
  const locale = useLocale();
  const [token, setToken] = useState<string | null>(null);
  const [qr, setQr] = useState<{ who: string; src: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (fresh: boolean) => {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("calendar_feed_token", { p_new: fresh, p_which: 2 });
    setBusy(false);
    if (error) return void toast.error(t("fail"));
    setToken(data as string);
    setQr(null);
    if (fresh) toast.success(t("renewed"));
  };
  useEffect(() => void load(false), []); // eslint-disable-line react-hooks/exhaustive-deps -- once

  const urlFor = (emp?: string) => (token ? `${window.location.origin}/api/calendar/feed?who=staff&t=${token}&lang=${locale}${emp ? `&emp=${emp}` : ""}` : "");
  const webcal = (u: string) => u.replace(/^https?:/, "webcal:");
  const copy = async (u: string) => {
    try {
      await navigator.clipboard.writeText(u);
      toast.success(t("copied"));
    } catch {
      toast.error(t("fail"));
    }
  };
  const message = (who: string, u: string) => t("message", { who, url: webcal(u) });
  const share = async (who: string, u: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: t("name"), text: message(who, u) });
        return;
      } catch {
        return;
      }
    }
    void copy(message(who, u));
  };
  const line = (who: string, u: string) => window.open(`https://line.me/R/share?text=${encodeURIComponent(message(who, u))}`, "_blank", "noopener");
  const showQr = async (who: string, u: string) => setQr({ who, src: await QRCode.toDataURL(webcal(u), { margin: 1, width: 240 }) });

  const Row = ({ who: shown, emp, all }: { who: string; emp?: string; all?: boolean }) => {
    const u = urlFor(emp);
    const who = all ? t("team") : shown;
    return (
      <li className={cn("flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5", all ? "bg-primary/8" : "bg-muted/50")}>
        <span className={cn("grid size-9 flex-none place-items-center rounded-full text-[13px] font-bold", all ? "bg-primary text-primary-foreground" : "bg-card text-primary")}>
          {all ? <Users className="size-4" aria-hidden /> : Array.from(who)[0]}
        </span>
        <span className="grid min-w-0 flex-1">
          <b className="truncate text-[14px]">{shown}</b>
          <span className="text-[11.5px] text-muted-foreground">{all ? t("allSub") : t("oneSub")}</span>
        </span>
        <span className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full text-[#06c755]" aria-label={t("line")} title={t("line")} onClick={() => line(who, u)}>
            <MessageCircle className="size-5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" aria-label={t("qr")} title={t("qr")} onClick={() => void showQr(who, u)}>
            <QrCode className="size-5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" aria-label={t("share")} title={t("share")} onClick={() => void share(who, u)}>
            <Share2 className="size-5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full" aria-label={t("copy")} title={t("copy")} onClick={() => void copy(u)}>
            <Copy className="size-5" />
          </Button>
        </span>
      </li>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-lg" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSync className="size-5 text-primary" aria-hidden />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("sub")}</DialogDescription>
        </DialogHeader>
        {!token ? (
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <div className="grid gap-3">
            {qr && (
              <div className="grid justify-items-center gap-2 rounded-2xl bg-white p-4 text-center text-black">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
                <img src={qr.src} alt={t("qrFor", { who: qr.who })} className="size-56" />
                <span className="text-[13px] font-semibold">{t("qrFor", { who: qr.who })}</span>
                <span className="text-[12px] text-black/60">{t("qrHint")}</span>
              </div>
            )}
            <ul className="grid gap-2">
              <Row who={t("everyone")} all />
              {employees.map((e) => (
                <Row key={e.id} who={e.nickname || e.name} emp={e.id} />
              ))}
            </ul>
            <ul className="grid gap-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>{t("howIphone")}</li>
              <li>{t("howAndroid")}</li>
              <li className="flex gap-1.5">
                <TriangleAlert className="mt-0.5 size-3.5 flex-none text-warn" aria-hidden />
                {t("privacy")}
              </li>
            </ul>
            <Button type="button" variant="ghost" className="h-10 w-fit rounded-full text-bad" disabled={busy} onClick={() => window.confirm(t("renewAsk")) && void load(true)}>
              <RefreshCw className="size-4" />
              {t("renew")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
