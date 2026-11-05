"use client";

// Save or share the attendance sheet that is already on screen (branch, month, and the visible staff).
// The file is made on this device. It is not uploaded, and no public link is created.

import { FileImage, Loader2, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ATTENDANCE_KINDS, type AttendanceRow } from "@/lib/attendance";
import { attendanceFileName, buildAttendanceSheet, type SheetBranchScope, type SheetStaff } from "@/lib/attendance-sheet";
import { deliverAttendanceFiles, downloadBlob } from "@/lib/attendance-share";
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
  branch,
}: {
  open: boolean;
  onClose: () => void;
  month: string;
  monthLabel: string;
  staff: readonly SheetStaff[];
  rows: readonly AttendanceRow[];
  yearRows: readonly AttendanceRow[];
  branch: SheetBranchScope;
}) {
  const t = useTranslations("pay");
  const locale = useLocale();
  const [personId, setPersonId] = useState("");
  const [format, setFormat] = useState<"pdf" | "png">("pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const canFileShare = () => {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    try {
      const probe = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], format === "pdf" ? "a.pdf" : "a.png", {
        type: format === "pdf" ? "application/pdf" : "image/png",
      });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  };

  const run = async (want: "download" | "share") => {
    if (!sheet.people.length) {
      setError(t("sheetShare.empty"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { buildAttendancePdf, loadSheetFonts } = await import("@/lib/attendance-sheet-pdf");
      const fonts = await loadSheetFonts();
      const pdf = await buildAttendancePdf(sheet, labels, fonts);
      const files: File[] =
        format === "pdf"
          ? [new File([toBuffer(pdf)], attendanceFileName(month, "pdf"), { type: "application/pdf" })]
          : await pngFiles(pdf, month);
      const result = await deliverAttendanceFiles({
        want,
        files,
        canShare: (list) => typeof navigator.canShare === "function" && navigator.canShare({ files: list as File[] }),
        share: async (list) => {
          await navigator.share({ files: list as File[], title: t("sheetShare.title") });
        },
        download: (file) => downloadBlob(file as File, file.name),
      });
      if (result.status === "cancelled") return;
      if (result.status === "shared") toast.success(t("sheetShare.shared"));
      else if (result.status === "saved-instead" && result.reason === "unsupported") toast.message(t("sheetShare.unsupported"));
      else if (result.status === "saved-instead") toast.message(t("sheetShare.failed"));
      else if (format === "png" && files.length > 1) toast.success(t("sheetShare.downloadedPages", { n: files.length }));
      else toast.success(t("sheetShare.downloaded"));
    } catch {
      setError(t("sheetShare.fail"));
      toast.error(t("sheetShare.fail"));
    } finally {
      setBusy(false);
    }
  };

  const shareOk = canFileShare();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-lg" data-lenis-prevent aria-busy={busy}>
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
          {error && (
            <p className="text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {shareOk && (
              <Button type="button" variant="secondary" className="h-10 rounded-full px-4" disabled={busy || !sheet.people.length} onClick={() => void run("share")}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                {t("sheetShare.share")}
              </Button>
            )}
            <Button type="button" className="h-10 rounded-full px-4" disabled={busy || !sheet.people.length} onClick={() => void run("download")}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileImage className="size-4" />}
              {busy ? t("sheetShare.making") : t("sheetShare.download")}
            </Button>
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
