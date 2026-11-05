import { describe, expect, it } from "vitest";
import { attendanceExportStamp, deliverAttendanceFiles, pngScaleFor, PNG_MAX_EDGE, shareNow, shouldPublishPrepared, type AttendanceExportIdentity, type ShareFile } from "./attendance-share";

const file = (name: string, type = "image/png"): ShareFile => ({ name, type });

describe("sharing an attendance file", () => {
  it("saves when the person asked to download, and does not open the share sheet", async () => {
    const downloaded: string[] = [];
    let shared = false;
    const result = await deliverAttendanceFiles({
      want: "download",
      files: [file("attendance-2026-01.pdf", "application/pdf")],
      canShare: () => true,
      share: async () => {
        shared = true;
      },
      download: (item) => downloaded.push(item.name),
    });
    expect(result).toEqual({ status: "downloaded", files: ["attendance-2026-01.pdf"] });
    expect(downloaded).toEqual(["attendance-2026-01.pdf"]);
    expect(shared).toBe(false);
  });

  it("reports shared only after the system share sheet accepts the files", async () => {
    const downloaded: string[] = [];
    const result = await deliverAttendanceFiles({
      want: "share",
      files: [file("attendance-2026-01.png"), file("attendance-2026-01-2.png")],
      canShare: () => true,
      share: async () => undefined,
      download: (item) => downloaded.push(item.name),
    });
    expect(result.status).toBe("shared");
    expect(downloaded).toEqual([]);
  });

  it("offers a download when this device cannot share files, and does not claim it was shared", async () => {
    const downloaded: string[] = [];
    const result = await deliverAttendanceFiles({
      want: "share",
      files: [file("attendance-2026-01.pdf", "application/pdf")],
      canShare: () => false,
      share: async () => {
        throw new Error("should not be called");
      },
      download: (item) => downloaded.push(item.name),
    });
    expect(result).toEqual({ status: "saved-instead", reason: "unsupported", files: ["attendance-2026-01.pdf"] });
    expect(downloaded).toEqual(["attendance-2026-01.pdf"]);
  });

  it("treats a thrown canShare and a missing share function as unsupported", async () => {
    const downloaded: string[] = [];
    const result = await deliverAttendanceFiles({
      want: "share",
      files: [file("a.png")],
      canShare: () => {
        throw new Error("nope");
      },
      download: (item) => downloaded.push(item.name),
    });
    expect(result.status).toBe("saved-instead");
    if (result.status === "saved-instead") expect(result.reason).toBe("unsupported");
    expect(downloaded).toEqual(["a.png"]);
  });

  it("closing the share sheet is a cancel, not an error and not a save", async () => {
    const downloaded: string[] = [];
    const result = await deliverAttendanceFiles({
      want: "share",
      files: [file("a.png")],
      canShare: () => true,
      share: async () => {
        const error = new Error("The user aborted a request.");
        error.name = "AbortError";
        throw error;
      },
      download: (item) => downloaded.push(item.name),
    });
    expect(result).toEqual({ status: "cancelled" });
    expect(downloaded).toEqual([]);
  });

  it("a failed share saves the file and does not say it was shared", async () => {
    const downloaded: string[] = [];
    const result = await deliverAttendanceFiles({
      want: "share",
      files: [file("a.pdf", "application/pdf"), file("b.pdf", "application/pdf")],
      canShare: () => true,
      share: async () => {
        throw new Error("share broke");
      },
      download: (item) => downloaded.push(item.name),
    });
    expect(result).toEqual({ status: "saved-instead", reason: "failed", files: ["a.pdf", "b.pdf"] });
    expect(downloaded).toEqual(["a.pdf", "b.pdf"]);
  });
});

describe("share stays inside the click", () => {
  const identity = (over: Partial<AttendanceExportIdentity> = {}, personOver: { label?: string; branchName?: string; outside?: boolean } = {}): AttendanceExportIdentity => ({
    format: "pdf",
    branchId: "b",
    personId: "",
    sheet: {
      month: "2026-01",
      branchLabel: "실롬",
      allBranches: false,
      showBranch: false,
      days: [{ date: "2026-01-01", weekday: "목", holiday: true, today: false }],
      people: [
        {
          id: "a",
          label: personOver.label ?? "예시김",
          leaveLabel: personOver.label ?? "김예시",
          branchName: personOver.branchName ?? "실롬",
          cells: [{ kind: "work", otHours: 0, outside: personOver.outside ?? false }],
          leave: { annualUsed: 1, annualEntitled: 6, sickUsed: 0, sickEntitled: 30 },
        },
      ],
    },
    labels: {
      title: "출근표",
      employee: "직원",
      subtitle: "실롬 · 2026년 1월 · 1명",
      short: { work: "출" },
      unmarked: "·",
      legend: ["출 출근"],
      leaveTitle: "2026년 휴가",
      leaveLines: ["김예시 — 연차 1일 사용"],
      daySpan: "1–16일",
    },
    ...over,
  });

  it("calls share before a later turn can clear the gesture", async () => {
    let active = true;
    const seen: string[] = [];
    const pending = shareNow(() => {
      seen.push(active ? "in-gesture" : "too-late");
      if (!active) {
        const error = new Error("not allowed");
        error.name = "NotAllowedError";
        throw error;
      }
      return Promise.resolve();
    });
    expect(seen).toEqual(["in-gesture"]);
    active = false;
    await expect(pending).resolves.toBe("shared");
  });

  it("the same guard rejects a share that waits for preparation first", async () => {
    let active = true;
    const prepare = async () => {
      await Promise.resolve();
      active = false;
    };
    await prepare();
    await expect(
      shareNow(() => {
        if (!active) {
          const error = new Error("not allowed");
          error.name = "NotAllowedError";
          throw error;
        }
        return Promise.resolve();
      }),
    ).resolves.toBe("failed");
  });

  it("a name, a branch label, the language, or an employment gap is a different file", () => {
    const base = attendanceExportStamp(identity());
    expect(attendanceExportStamp(identity())).toBe(base);
    expect(attendanceExportStamp(identity({}, { label: "다른이름" }))).not.toBe(base);
    expect(attendanceExportStamp(identity({}, { branchName: "아속" }))).not.toBe(base);
    expect(attendanceExportStamp(identity({}, { outside: true }))).not.toBe(base);
    const english = identity();
    english.labels = { ...english.labels, title: "Attendance sheet", daySpan: "1–16", leaveLines: ["Kim — annual 1 used"] };
    english.sheet = { ...english.sheet, days: [{ ...english.sheet.days[0], weekday: "T" }] };
    expect(attendanceExportStamp(english)).not.toBe(base);
    expect(attendanceExportStamp(identity({ personId: "a" }))).not.toBe(base);
    expect(attendanceExportStamp(identity({ format: "png" }))).not.toBe(base);
  });

  it("a cancelled or outdated preparation is not published", () => {
    expect(shouldPublishPrepared(true, "old", "old")).toBe(false);
    expect(shouldPublishPrepared(false, "old", "new")).toBe(false);
    expect(shouldPublishPrepared(false, "new", "new")).toBe(true);
  });
});

describe("png page scale", () => {
  it("prefers 2× and shrinks so a page stays under the canvas limit", () => {
    expect(pngScaleFor(842, 595)).toBe(2);
    expect(pngScaleFor(842, 595) * 842).toBeLessThanOrEqual(PNG_MAX_EDGE);
    const scale = pngScaleFor(3000, 4000, 4096);
    expect(scale * 4000).toBeLessThanOrEqual(4096);
    expect(scale).toBeLessThan(2);
  });
});
