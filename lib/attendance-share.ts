// Hand the attendance file to the phone's share sheet, or save it on this device.
// A browser that cannot share files must not be told the sheet was shared.
// Closing the share sheet (AbortError) is the person changing their mind, not a failure.

export interface ShareFile {
  name: string;
  type: string;
}

export type DeliverResult =
  | { status: "downloaded"; files: string[] }
  | { status: "shared" }
  | { status: "cancelled" }
  | { status: "saved-instead"; reason: "unsupported" | "failed"; files: string[] };

export async function deliverAttendanceFiles(input: {
  want: "download" | "share";
  files: readonly ShareFile[];
  /** True only when this device can hand these files to the system share sheet. */
  canShare?: (files: readonly ShareFile[]) => boolean;
  share?: (files: readonly ShareFile[]) => Promise<void>;
  download: (file: ShareFile) => void;
}): Promise<DeliverResult> {
  const files = [...input.files];
  if (!files.length) throw new Error("no files");
  const save = () => {
    for (const file of files) input.download(file);
    return files.map((file) => file.name);
  };
  if (input.want === "download") return { status: "downloaded", files: save() };

  let supported = false;
  try {
    supported = !!input.canShare?.(files) && typeof input.share === "function";
  } catch {
    supported = false;
  }
  if (!supported || !input.share) return { status: "saved-instead", reason: "unsupported", files: save() };

  try {
    await input.share(files);
    return { status: "shared" };
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
    if (name === "AbortError") return { status: "cancelled" };
    return { status: "saved-instead", reason: "failed", files: save() };
  }
}

/**
 * Call the system share sheet in this turn. `share` runs before this function waits, so a click
 * handler can pass `() => navigator.share(...)` and still be inside the user's gesture.
 * Anything awaited before this call is too late on a slow phone.
 */
export function shareNow(share: () => Promise<void> | void): Promise<"shared" | "cancelled" | "failed"> {
  try {
    return Promise.resolve(share()).then(
      () => "shared" as const,
      (error: unknown) => classifyShareError(error),
    );
  } catch (error) {
    return Promise.resolve(classifyShareError(error));
  }
}

function classifyShareError(error: unknown): "cancelled" | "failed" {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  return name === "AbortError" ? "cancelled" : "failed";
}

/** Everything that is drawn: names, branch labels, marks, employment gaps, and the words on the page. */
export interface AttendanceExportIdentity {
  format: string;
  branchId: string;
  personId: string;
  sheet: {
    month: string;
    branchLabel: string;
    allBranches: boolean;
    showBranch: boolean;
    days: readonly { date: string; weekday: string; holiday: boolean; today: boolean }[];
    people: readonly {
      id: string;
      label: string;
      leaveLabel: string;
      branchName: string;
      cells: readonly { kind: string | null; otHours: number; outside: boolean }[];
      leave: { annualUsed: number; annualEntitled: number; sickUsed: number; sickEntitled: number };
    }[];
  };
  labels: {
    title: string;
    employee: string;
    subtitle: string;
    short: Readonly<Record<string, string>>;
    unmarked: string;
    legend: readonly string[];
    leaveTitle: string;
    leaveLines: readonly string[];
    /** The translated "1–16" wording, so a language change is a new file even before a page split. */
    daySpan: string;
  };
}

/** Changes when the drawn sheet changes, so a prepared file is not reused. */
export function attendanceExportStamp(input: AttendanceExportIdentity): string {
  return JSON.stringify(input);
}

/** A finished preparation is kept only for the sheet that is on screen now, and only if it was not cancelled. */
export function shouldPublishPrepared(cancelled: boolean, wanted: string, current: string): boolean {
  return !cancelled && wanted === current;
}

/** Save a file on this device. One click saves one file, so the browser is not asked for several at once. */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

/** Mobile canvases often fail or crop past 4096px on a side. PNG pages stay under this. */
export const PNG_MAX_EDGE = 4096;

/** pdf.js scale (1 = one pixel per point) that stays inside `maxEdge` and prefers 2×. */
export function pngScaleFor(widthPt: number, heightPt: number, maxEdge = PNG_MAX_EDGE): number {
  const longest = Math.max(widthPt, heightPt, 1);
  const want = 2;
  if (longest * want <= maxEdge) return want;
  return Math.max(0.5, maxEdge / longest);
}
