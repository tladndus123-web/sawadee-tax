"use client";

// A work-schedule photo → the attendance sheet (owner, 2026-11-06: "근무표 사진으로 만들어 줄 수 있을까"): pick or take
// one or more photos (two halves of a month are fine), the AI reads who works which day (/api/payroll/schedule-read),
// and this shows each person's month to check — who is who, the days in colour, "blank days are work days" — before
// anything is saved. Saving replaces what was there for those days; the staff calendars follow by themselves.

import { Camera, Loader2, ScanLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ATTENDANCE_KINDS, type AttendanceKind } from "@/lib/attendance";
import { saveAttendanceMany } from "@/lib/attendance-store";
import { isMonthLocked } from "@/lib/month-lock-store";
import type { Employee } from "@/lib/payroll";
import { cellsToSave, mergeSheets, type SheetReading } from "@/lib/schedule-read";
import { preparePhoto } from "@/lib/upload-queue";
import { isPdf } from "@/lib/pdf-render";
import { cn } from "@/lib/utils";

const DOT: Record<AttendanceKind, string> = { work: "bg-ok", off: "bg-muted-foreground/30", absent: "bg-bad", annual: "bg-brand", sick: "bg-warn" };
const MAX = 4;

export function ScheduleFromPhoto({ month, staff, onClose, onSaved }: { month: string; staff: Employee[]; onClose: () => void; onSaved: (month: string) => void }) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [sheet, setSheet] = useState<SheetReading | null>(null);
  const [who, setWho] = useState<(string | null)[]>([]);
  const [blankIsWork, setBlankIsWork] = useState(false);
  const [saving, setSaving] = useState(false);
  const monthText = (m: string) => new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

  const read = async (picked: File[]) => {
    const files = picked.slice(0, MAX);
    if (!files.length) return;
    if (picked.length > MAX) toast.message(t("sheet.max", { n: MAX }));
    setReading({ done: 0, total: files.length });
    const results = await Promise.all(
      files.map(async (f) => {
        try {
          const prepared = isPdf(f) ? f : await preparePhoto(f);
          const body = new FormData();
          body.append("file", prepared, isPdf(f) ? f.name : "schedule.jpg");
          body.append("month", month);
          body.append("ids", staff.map((e) => e.id).join(","));
          body.append("batch", String(files.length));
          const res = await fetch("/api/payroll/schedule-read", { method: "POST", body });
          const json = (await res.json().catch(() => ({}))) as SheetReading & { error?: string };
          setReading((r) => (r ? { ...r, done: r.done + 1 } : r));
          return res.ok ? (json as SheetReading) : { error: json.error ?? "failed" };
        } catch {
          setReading((r) => (r ? { ...r, done: r.done + 1 } : r));
          return { error: "failed" };
        }
      }),
    );
    setReading(null);
    const ok = results.filter((r): r is SheetReading => !("error" in r));
    const merged = mergeSheets(ok);
    if (!merged || !merged.people.length) {
      const e = results.find((r) => "error" in r) as { error: string } | undefined;
      toast.error(e?.error === "notSchedule" ? t("sheet.notSchedule") : e?.error === "rate" ? t("sheet.rate") : t("sheet.fail"));
      return;
    }
    if (ok.length < files.length) toast.message(t("sheet.someFailed", { n: files.length - ok.length }));
    setSheet(merged);
    setWho(merged.people.map((p) => p.employeeId));
    setBlankIsWork(merged.blankIsWork);
  };

  const chosen = sheet ? sheet.people.map((p, i) => ({ p, id: who[i] })).filter((x): x is { p: (typeof x)["p"]; id: string } => !!x.id) : [];
  const save = async () => {
    if (!sheet) return;
    setSaving(true);
    try {
      const cells = chosen.flatMap(({ p, id }) => {
        const e = staff.find((s) => s.id === id);
        return cellsToSave(p, sheet.month, blankIsWork, { startDate: e?.startDate || undefined, endDate: e?.endDate || undefined }).map((c) => ({ ...c, employeeId: id }));
      });
      await saveAttendanceMany(cells);
      toast.success(sheet.month === month ? t("sheet.saved", { n: chosen.length }) : t("sheet.savedOther", { n: chosen.length, month: monthText(sheet.month) }));
      onSaved(sheet.month);
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
      setSaving(false);
    }
  };

  // A tap on a day fixes what the AI read: work → off → annual → sick → absent → blank → work
  const CYCLE: (AttendanceKind | null)[] = ["work", "off", "annual", "sick", "absent", null];
  const cycle = (i: number, dayNo: number) =>
    setSheet((sh) => {
      if (!sh) return sh;
      const day = `${sh.month}-${String(dayNo).padStart(2, "0")}`;
      const people = sh.people.map((p, j) => {
        if (j !== i) return p;
        const cur = p.cells.find((c) => c.day === day);
        const next = CYCLE[(CYCLE.indexOf(cur?.kind ?? null) + 1) % CYCLE.length];
        const rest = p.cells.filter((c) => c.day !== day);
        return { ...p, cells: next ? [...rest, { day, kind: next, otHours: next === "work" ? (cur?.otHours ?? 0) : 0 }].sort((a, b) => a.day.localeCompare(b.day)) : rest };
      });
      return { ...sh, people };
    });

  const days = sheet ? new Date(Date.UTC(Number(sheet.month.slice(0, 4)), Number(sheet.month.slice(5, 7)), 0)).getUTCDate() : 0;
  const usedIds = new Set(who.filter(Boolean));

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && !reading && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-2xl" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" aria-hidden />
            {t("sheet.title")}
          </DialogTitle>
          <DialogDescription>{sheet ? t("sheet.check", { month: monthText(sheet.month) }) : t("sheet.sub")}</DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void read(files);
          }}
        />

        {reading ? (
          <div className="grid justify-items-center gap-3 py-8 text-center" aria-live="polite">
            <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("sheet.reading", { done: reading.done, total: reading.total })}</p>
          </div>
        ) : !sheet ? (
          <div className="grid gap-3">
            <button type="button" onClick={() => fileRef.current?.click()} className="press grid justify-items-center gap-2 rounded-3xl border-2 border-dashed border-primary/30 bg-primary/5 px-6 py-10 text-center hover:bg-primary/10">
              <Camera className="size-8 text-primary" aria-hidden />
              <b className="text-[15px]">{t("sheet.pick")}</b>
              <span className="text-[12.5px] text-muted-foreground">{t("sheet.pickHint")}</span>
            </button>
            <ul className="grid gap-1 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>· {t("sheet.tip1")}</li>
              <li>· {t("sheet.tip2")}</li>
            </ul>
          </div>
        ) : (
          <div className="grid gap-3">
            {sheet.month !== month && <p className="rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px]">{t("sheet.otherMonth", { month: monthText(sheet.month) })}</p>}
            <ul className="grid gap-2">
              {sheet.people.map((p, i) => {
                const counts = ATTENDANCE_KINDS.map((k) => [k, p.cells.filter((c) => c.kind === k).length] as const).filter(([, n]) => n > 0);
                const byDay = new Map(p.cells.map((c) => [Number(c.day.slice(8)), c]));
                return (
                  <li key={i} className={cn("grid gap-2 rounded-2xl px-3.5 py-3", who[i] ? "bg-muted/50" : "bg-muted/25 opacity-70")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                        {t("sheet.onSheet")} <b className="text-foreground">{p.nameOnSheet}</b>
                      </span>
                      <select
                        className="h-10 rounded-full border bg-card px-3 text-sm"
                        value={who[i] ?? ""}
                        aria-label={t("sheet.whoLabel", { name: p.nameOnSheet })}
                        onChange={(e) => setWho((w) => w.map((x, j) => (j === i ? e.target.value || null : x)))}
                      >
                        <option value="">{t("sheet.skip")}</option>
                        {staff.map((e) => (
                          <option key={e.id} value={e.id} disabled={usedIds.has(e.id) && who[i] !== e.id}>
                            {e.nickname ? `${e.nickname} · ${e.name}` : e.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-[repeat(11,minmax(0,1fr))] gap-[3px] sm:grid-cols-[repeat(16,minmax(0,1fr))] lg:grid-cols-[repeat(31,minmax(0,1fr))]">
                      {Array.from({ length: days }, (_, d) => {
                        const c = byDay.get(d + 1);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => cycle(i, d + 1)}
                            aria-label={`${p.nameOnSheet} ${d + 1}: ${c ? t(`kind.${c.kind}`) : "—"}`}
                            className={cn("press grid h-8 place-items-center rounded-md text-[10px] font-semibold", c ? cn(DOT[c.kind], c.kind === "off" ? "text-foreground/70" : "text-white") : blankIsWork ? "bg-ok/25 text-ok" : "bg-muted text-muted-foreground/50")}
                          >
                            {d + 1}
                          </button>
                        );
                      })}
                    </div>
                    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                      {counts.map(([k, n]) => (
                        <span key={k} className="inline-flex items-center gap-1">
                          <span className={cn("size-2 rounded-full", DOT[k])} aria-hidden />
                          {t(`kind.${k}`)} {n}
                        </span>
                      ))}
                      {p.cells.some((c) => c.otHours > 0) && <span>OT {p.cells.reduce((a, c) => a + c.otHours, 0)}h</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
            <label className="flex items-center gap-3 rounded-2xl bg-muted/40 px-3.5 py-3">
              <Switch checked={blankIsWork} onCheckedChange={setBlankIsWork} />
              <span className="grid">
                <span className="text-sm font-medium">{t("sheet.blankIsWork")}</span>
                <span className="text-[12px] text-muted-foreground">{t("sheet.blankHint")}</span>
              </span>
            </label>
            <p className="text-[12px] text-muted-foreground">
              {t("sheet.tapFix")} {t("sheet.replaceNote")}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" className="h-11 rounded-full px-4" disabled={saving} onClick={() => (setSheet(null), fileRef.current?.click())}>
                {t("sheet.again")}
              </Button>
              <Button type="button" className="h-11 rounded-full px-5" disabled={saving || !chosen.length} onClick={() => void save()}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("sheet.save", { n: chosen.length })}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
