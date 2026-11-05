"use client";

// Quick review (owner, 2026-11-06): the waiting claims one card at a time — the receipt big, the amount, the checks and
// the AI's note — approve, skip or reject (with a reason), then the next one. Phones: swipe right to approve, left to
// skip. Keys: → approve, ← skip.

import { Check, ChevronRight, Image as ImageIcon, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CategoryIcon, useCategoryLabel } from "@/components/vendors/CategoryIcon";
import { claimPhotoUrl, decideClaims } from "@/lib/expense-store";
import type { Flag } from "@/lib/expense-checks";
import type { Claim } from "@/lib/expenses";
import { baht, fromSatang } from "@/lib/money";
import { cn } from "@/lib/utils";

export function QuickReview({ claims, flags, notes, flagText, onClose }: { claims: Claim[]; flags: Map<string, Flag[]>; notes: Record<string, string>; flagText: (f: Flag) => string; onClose: () => void }) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const catLabel = useCategoryLabel();
  // The queue as it was when opened (decided ones leave it)
  const [queue] = useState(claims);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState({ ok: 0, no: 0 });
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const c = queue[at];

  useEffect(() => {
    setPhoto(undefined);
    setRejecting(false);
    setReason("");
    if (c?.photoPath) void claimPhotoUrl(c.photoPath).then(setPhoto);
    else setPhoto(null);
  }, [c?.id, c?.photoPath]);

  const next = () => setAt((i) => i + 1);
  const decide = async (status: "approved" | "rejected") => {
    if (!c || busy) return;
    setBusy(true);
    try {
      await decideClaims([c.id], status, reason);
      setDone((d) => (status === "approved" ? { ...d, ok: d.ok + 1 } : { ...d, no: d.no + 1 }));
      next();
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (rejecting || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") void decide("approved");
      if (e.key === "ArrowLeft") next();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const day = (d: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const fl = c ? (flags.get(c.id) ?? []) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto rounded-3xl sm:max-w-lg" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle>{t("quick.title")}</DialogTitle>
          <DialogDescription>{c ? t("quick.progress", { n: at + 1, total: queue.length }) : t("quick.doneSub", { ok: done.ok, no: done.no })}</DialogDescription>
        </DialogHeader>
        {/* progress */}
        <div className="flex gap-1" aria-hidden>
          {queue.map((q, i) => (
            <span key={q.id} className={cn("h-1.5 flex-1 rounded-full", i < at ? "bg-primary" : i === at ? "bg-primary/40" : "bg-muted")} />
          ))}
        </div>

        {!c ? (
          <div className="grid justify-items-center gap-3 py-8 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-ok-soft text-ok">
              <Check className="size-8" aria-hidden />
            </span>
            <p className="text-[17px] font-semibold">{t("quick.done")}</p>
            <Button type="button" className="h-11 rounded-full px-6" onClick={onClose}>
              {t("quick.close")}
            </Button>
          </div>
        ) : (
          <div
            className="grid touch-pan-y gap-3 transition-transform"
            style={{ transform: `translateX(${drag}px) rotate(${drag / 40}deg)` }}
            onPointerDown={(e) => (e.pointerType === "touch" ? (start.current = e.clientX) : undefined)}
            onPointerMove={(e) => start.current !== null && setDrag(e.clientX - start.current)}
            onPointerUp={() => {
              if (start.current === null) return;
              start.current = null;
              const d = drag;
              setDrag(0);
              if (d > 110) void decide("approved");
              else if (d < -110) next();
            }}
            onPointerCancel={() => ((start.current = null), setDrag(0))}
          >
            <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-muted">
              {photo === undefined ? (
                <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
              ) : photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL
                <img src={photo} alt={t("detail.photo")} className="size-full object-contain" draggable={false} />
              ) : (
                <span className="flex items-center gap-2 text-[14px] text-muted-foreground">
                  <ImageIcon className="size-5" aria-hidden />
                  {t("noPhoto")}
                </span>
              )}
              {drag > 40 && <span className="absolute top-3 left-3 rounded-full bg-ok px-3 py-1 text-sm font-bold text-white">{t("approve")}</span>}
              {drag < -40 && <span className="absolute top-3 right-3 rounded-full bg-muted-foreground px-3 py-1 text-sm font-bold text-white">{t("quick.skip")}</span>}
            </div>
            <div className="flex items-start gap-3">
              <CategoryIcon category={c.category} />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="truncate text-[15px] font-semibold">
                  {c.name} · {c.seller || catLabel(c.category)}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {day(c.day)} · {catLabel(c.category)}
                  {c.note ? ` · ${c.note}` : ""}
                </p>
              </div>
              <b className="text-[22px] leading-none tabular-nums">{baht(fromSatang(c.amount))}</b>
            </div>
            {notes[c.id] && (
              <p className="flex items-start gap-2 rounded-xl bg-primary/8 px-3 py-2 text-[13px] text-foreground">
                <Sparkles className="mt-0.5 size-4 flex-none text-primary" aria-hidden />
                {notes[c.id]}
              </p>
            )}
            {fl.length > 0 && (
              <ul className="grid gap-1 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                {fl.map((f) => (
                  <li key={f.kind} className="flex items-start gap-1.5">
                    <TriangleAlert className="mt-0.5 size-3.5 flex-none" aria-hidden />
                    {flagText(f)}
                  </li>
                ))}
              </ul>
            )}
            {rejecting ? (
              <div className="grid gap-2">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("rejectPh")} className="h-11" autoFocus />
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" className="h-11 flex-1 rounded-full" onClick={() => setRejecting(false)}>
                    {t("cancel")}
                  </Button>
                  <Button type="button" variant="destructive" className="h-11 flex-1 rounded-full" disabled={busy} onClick={() => void decide("rejected")}>
                    {t("reject")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto_1.4fr] gap-2">
                <Button type="button" variant="outline" className="h-12 rounded-full text-bad" disabled={busy} onClick={() => setRejecting(true)}>
                  <X className="size-4" />
                  {t("reject")}
                </Button>
                <Button type="button" variant="ghost" className="h-12 rounded-full px-4" disabled={busy} onClick={next} aria-label={t("quick.skip")}>
                  <ChevronRight className="size-5" />
                </Button>
                <Button type="button" className="h-12 rounded-full text-[15px]" disabled={busy} onClick={() => void decide("approved")}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {t("approve")}
                </Button>
              </div>
            )}
            <p className="text-center text-[11.5px] text-muted-foreground">{t("quick.hint")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
