"use client";

// Save or share the attendance sheet that is already on screen (branch, month, and the visible staff).
// The file is made on this device. It is not uploaded, and no public link is created.

import { FileImage, Loader2, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ATTENDANCE_KINDS, type AttendanceRow } from "@/lib/attendance";
import { attendanceFileName, buildAttendanceSheet, type SheetBranchScope, type SheetStaff } from "@/lib/attendance-sheet";
import { attendanceExportStamp, downloadBlob, shareNow } from "@/lib/attendance-share";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";

export function AttendanceShare({
  open,
  onClose,
  month,
  monthLabel,
  staff,
  rows,
  yearRows,
  leaveReady,
  leaveFailed,
  branch,
}: {
  open: boolean;
  onClose: () => void;
  month: string;
  monthLabel: string;
  staff: readonly SheetStaff[];
  rows: readonly AttendanceRow[];
  yearRows: readonly AttendanceRow[];
  /** False while this year's leave is still loading, so the file does not ship half the numbers. */
  leaveReady: boolean;
  leaveFailed: boolean;
  branch: SheetBranchScope;
}) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const [personId, setPersonId] = useState("");
  const [format, setFormat] = useState<"pdf" | "png">("pdf");
  const [error, setError] = useState("");
  const [ready, setReady] = useState<{ stamp: string; files: File[] } | null>(null);

  const sheet = useMemo(
    () =>
      buildAttendanceSheet({
        month,
        staff,
        rows,
        yearRows,
        personId: personId || null,
        branch,
        locale,
        today: todayBangkok(),
      }),
    [month, staff, rows, yearRows, personId, branch, locale],
  );

  const labels = useMemo(() => {
    const year = Number(month.slice(0, 4)) || 0;
    return {
      title: t("sheetShare.docTitle"),
      employee: t("employee"),
      subtitle: [branch.label, monthLabel, t("sheetShare.peopleN", { n: sheet.people.length })].filter(Boolean).join(" · "),
      daySpan: (from: number, to: number) => t("sheetShare.daySpan", { from, to }),
      short: Object.fromEntries(ATTENDANCE_KINDS.map((kind) => [kind, t(`kindShort.${kind}`)])) as Record<(typeof ATTENDANCE_KINDS)[number], string>,
      unmarked: "·",
      legend: [...ATTENDANCE_KINDS.map((kind) => `${t(`kindShort.${kind}`)} ${t(`kind.${kind}`)}`), `· ${t("sheetShare.legendUnmarked")}`, t("sheetShare.legendHoliday")],
      pageLabel: (n: number, total: number) => t("sheetShare.page", { n, total }),
      leaveTitle: t("leaveTitle", { year }),
      leaveLines: sheet.people.map((person) => {
        const annual = person.leave.annualEntitled
          ? t("annualLeft", { used: person.leave.annualUsed, left: Math.max(0, person.leave.annualEntitled - person.leave.annualUsed) })
          : t("annualNotYet");
        return `${person.leaveLabel} — ${annual} · ${t("sickUsed", { used: person.leave.sickUsed, max: person.leave.sickEntitled })}`;
      }),
    };
  }, [t, branch.label, monthLabel, month, sheet.people]);

  const stamp = attendanceExportStamp({
    month,
    branchId: branch.id,
    personId,
    format,
    people: sheet.people.map((person) => ({
      id: person.id,
      cells: person.cells.map((cell) => ({ kind: cell.kind, otHours: cell.otHours })),
      annualUsed: person.leave.annualUsed,
      annualEntitled: person.leave.annualEntitled,
      sickUsed: person.leave.sickUsed,
    })),
  });

  useEffect(() => {
    if (!open || !leaveReady || !sheet.people.length) {
      setReady(null);
      return;
    }
    let cancel = false;
    setReady(null);
    setError("");
    const wanted = stamp;
    void (async () => {
      try {
        const { buildAttendancePdf, loadSheetFonts } = await import("@/lib/attendance-sheet-pdf");
        const fonts = await loadSheetFonts();
        const pdf = await buildAttendancePdf(sheet, labels, fonts);
        const files = format === "pdf" ? [new File([toBuffer(pdf)], attendanceFileName(month, "pdf"), { type: "application/pdf" })] : await pngFiles(pdf, month);
        if (!cancel) setReady({ stamp: wanted, files });
      } catch {
        if (!cancel) setError(t("sheetShare.fail"));
      }
    })();
    return () => {
      cancel = true;
    };
    // The stamp already covers the sheet. Rebuilding when it changes drops the previous file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leaveReady, stamp]);

  const files = ready?.stamp === stamp ? ready.files : null;

  const shareOk = (() => {
    if (!files || typeof navigator === "undefined" || typeof navigator.canShare !== "function" || typeof navigator.share !== "function") return false;
    try {
      return navigator.canShare({ files });
    } catch {
      return false;
    }
  })();

  const onShare = () => {
    if (!files || typeof navigator.share !== "function") return;
    const pending = shareNow(() => navigator.share({ files, title: t("sheetShare.title") }));
    void pending.then((status) => {
      if (status === "shared") toast.success(t("sheetShare.shared"));
      else if (status === "failed") toast.message(t("sheetShare.failed"));
    });
  };

  const saveOne = (file: File) => {
    downloadBlob(file, file.name);
    toast.success(t("sheetShare.downloaded"));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-lg" data-lenis-prevent aria-busy={!files && leaveReady && !leaveFailed && !error}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Share2 className="size-5 text-primary" aria-hidden />
            {t("sheetShare.title")}
          </DialogTitle>
          <DialogDescription>{t("sheetShare.sub")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1 rounded-2xl bg-muted/70 px-4 py-3 text-[13px]">
            <p>
              <span className="text-muted-foreground">{t("sheetShare.branch")}</span> · {branch.label || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">{t("sheetShare.period")}</span> · {monthLabel}
            </p>
            <p>
              <span className="text-muted-foreground">{t("sheetShare.who")}</span> · {personId ? (sheet.people[0]?.label ?? "—") : t("sheetShare.everyone", { n: staff.length })}
            </p>
            {branch.id === "all" && <p className="text-muted-foreground">{t("sheetShare.allBranches")}</p>}
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{t("sheetShare.who")}</span>
            <select className="h-10 rounded-full border bg-card px-3" value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label={t("sheetShare.who")}>
              <option value="">{t("sheetShare.everyone", { n: staff.length })}</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {(person.nickname.trim() || person.name.trim() || "—") + (branch.id === "all" && person.branchName ? ` · ${person.branchName}` : "")}
                </option>
              ))}
            </select>
          </label>
          <ul className="max-h-28 overflow-y-auto rounded-2xl border border-border/70 px-3 py-2 text-[13px]">
            {sheet.people.map((person) => (
              <li key={person.id} className="truncate py-0.5">
                {person.label}
                {sheet.showBranch && person.branchName ? <span className="text-muted-foreground"> · {person.branchName}</span> : null}
              </li>
            ))}
          </ul>
          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">{t("sheetShare.format")}</span>
            <div className="flex rounded-full bg-muted p-1" role="radiogroup" aria-label={t("sheetShare.format")}>
              {(["pdf", "png"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={format === kind}
                  onClick={() => setFormat(kind)}
                  className={cn("h-10 flex-1 rounded-full px-3 text-sm", format === kind ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}
                >
                  {kind === "pdf" ? t("sheetShare.pdf") : t("sheetShare.png")}
                </button>
              ))}
            </div>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">{format === "pdf" ? t("sheetShare.pdfHint") : t("sheetShare.pngHint")}</p>
          </div>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("sheetShare.contains")}</p>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("sheetShare.savedOnly")}</p>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t("sheetShare.noLink")}</p>
          {leaveFailed && <p className="text-sm text-bad">{t("sheetShare.leaveFail")}</p>}
          {!leaveFailed && !leaveReady && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("sheetShare.leaveLoading")}
            </p>
          )}
          {leaveReady && !files && !error && !leaveFailed && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("sheetShare.making")}
            </p>
          )}
          {error && (
            <p className="text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          {files && files.length > 1 && <p className="text-[12.5px] text-muted-foreground">{t("sheetShare.pagesReady", { n: files.length })}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {shareOk && (
              <Button type="button" variant="secondary" className="h-10 rounded-full px-4" onClick={onShare}>
                <Share2 className="size-4" />
                {t("sheetShare.share")}
              </Button>
            )}
            {files?.map((file, index) => (
              <Button key={file.name} type="button" className="h-10 rounded-full px-4" onClick={() => saveOne(file)}>
                <FileImage className="size-4" />
                {files.length > 1 ? t("sheetShare.savePage", { n: index + 1 }) : t("sheetShare.download")}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function pngFiles(pdf: Uint8Array, month: string): Promise<File[]> {
  const { pdfToPngPages } = await import("@/lib/attendance-sheet-png");
  const pages = await pdfToPngPages(pdf);
  return pages.map((blob, index) => new File([blob], attendanceFileName(month, "png", index + 1, pages.length), { type: "image/png" }));
}
