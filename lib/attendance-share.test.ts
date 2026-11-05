import { describe, expect, it } from "vitest";
import { attendanceExportStamp, deliverAttendanceFiles, pngScaleFor, PNG_MAX_EDGE, shareNow, type ShareFile } from "./attendance-share";

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
  const person = (id: string, annualUsed = 0) => ({ id, cells: [{ kind: "work" as string | null, otHours: 0 }], annualUsed, annualEntitled: 6, sickUsed: 0 });

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

  it("a new person or a new leave total is a different file", () => {
    const base = { month: "2026-01", branchId: "b", personId: "", format: "pdf", people: [person("a", 1), person("b")] };
    expect(attendanceExportStamp(base)).toBe(attendanceExportStamp({ ...base, people: [person("a", 1), person("b")] }));
    expect(attendanceExportStamp({ ...base, personId: "a" })).not.toBe(attendanceExportStamp(base));
    expect(attendanceExportStamp({ ...base, people: [person("a", 2), person("b")] })).not.toBe(attendanceExportStamp(base));
    expect(attendanceExportStamp({ ...base, format: "png" })).not.toBe(attendanceExportStamp(base));
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
