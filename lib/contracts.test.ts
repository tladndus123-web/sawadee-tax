import { describe, expect, it } from "vitest";
import {
  type Contract,
  checkFile,
  contractFilePath,
  contractState,
  daysLeft,
  endingSoon,
  filterCounts,
  isContractPath,
  matchesFilter,
  matchesQuery,
  noticeBy,
  rowToContract,
  safeFileName,
  sortContracts,
  typeOfPath,
} from "./contracts";

const TODAY = "2026-11-18";
const ID = "00000000-0000-0000-0000-0000000c7101";
const c = (over: Partial<Contract>): Contract => ({
  id: ID,
  title: "Lease",
  party: "",
  kind: "lease",
  startOn: null,
  endOn: null,
  autoRenew: false,
  noticeDays: 30,
  amount: null,
  note: "",
  filePath: null,
  fileName: null,
  fileType: null,
  branchId: null,
  createdAt: "",
  ...over,
});

describe("rowToContract", () => {
  it("reads a row", () => {
    const r = rowToContract({ id: ID, title: "Shop", party: "Landlord", kind: "lease", start_on: "2026-01-01", end_on: "2026-12-31", auto_renew: true, notice_days: 60, amount: "4500000", note: "n", file_path: `contracts/${ID}/1-a.pdf`, file_name: "a.pdf", file_type: "application/pdf", branch_id: null });
    expect(r).toMatchObject({ title: "Shop", kind: "lease", startOn: "2026-01-01", endOn: "2026-12-31", autoRenew: true, noticeDays: 60, amount: 4_500_000, fileName: "a.pdf", branchId: null });
  });
  it("makes odd values plain", () => {
    const r = rowToContract({ kind: "marriage", start_on: "soon", notice_days: 999, amount: "" });
    expect(r).toMatchObject({ kind: "other", startOn: null, noticeDays: 365, amount: null, filePath: null });
  });
});

describe("state", () => {
  it("ended / soon / active / open / waiting", () => {
    expect(contractState(c({ endOn: "2026-11-17" }), TODAY)).toBe("ended");
    expect(contractState(c({ endOn: "2026-12-10" }), TODAY)).toBe("soon");
    expect(contractState(c({ endOn: "2027-06-01" }), TODAY)).toBe("active");
    expect(contractState(c({}), TODAY)).toBe("open");
    expect(contractState(c({ startOn: "2027-01-01", endOn: "2028-01-01" }), TODAY)).toBe("waiting");
  });
  it("uses the notice days, 30 when none is set", () => {
    expect(contractState(c({ endOn: "2027-01-10", noticeDays: 60 }), TODAY)).toBe("soon");
    expect(contractState(c({ endOn: "2027-01-10", noticeDays: 30 }), TODAY)).toBe("active");
    expect(contractState(c({ endOn: "2026-12-15", noticeDays: 0 }), TODAY)).toBe("soon");
  });
  it("ends today counts as soon, day left 0", () => {
    expect(contractState(c({ endOn: TODAY }), TODAY)).toBe("soon");
    expect(daysLeft(c({ endOn: TODAY }), TODAY)).toBe(0);
    expect(daysLeft(c({ endOn: "2026-11-15" }), TODAY)).toBe(-3);
    expect(daysLeft(c({}), TODAY)).toBeNull();
  });
  it("last day to say no to a renewal", () => {
    expect(noticeBy(c({ endOn: "2026-12-31", autoRenew: true, noticeDays: 30 }))).toBe("2026-12-01");
    expect(noticeBy(c({ endOn: "2026-12-31", autoRenew: false }))).toBeNull();
  });
});

describe("list", () => {
  const list = [
    c({ id: "a", title: "Ended", endOn: "2026-01-01" }),
    c({ id: "b", title: "Standing" }),
    c({ id: "c", title: "Later", endOn: "2027-08-01" }),
    c({ id: "d", title: "Soon", endOn: "2026-12-01" }),
    c({ id: "e", title: "Sooner", endOn: "2026-11-20" }),
  ];
  it("sorts ends-soon first, ended last", () => {
    expect(sortContracts(list, TODAY).map((x) => x.id)).toEqual(["e", "d", "c", "b", "a"]);
    expect(endingSoon(list, TODAY).map((x) => x.id)).toEqual(["e", "d"]);
  });
  it("filters and counts", () => {
    expect(filterCounts(list, TODAY)).toEqual({ all: 5, soon: 2, active: 4, ended: 1 });
    expect(matchesFilter(list[0], "active", TODAY)).toBe(false);
  });
  it("searches every word in title, party, note and file name", () => {
    const x = c({ title: "店舗の賃貸", party: "ABC Co., Ltd.", note: "Rent ฿45,000", fileName: "lease-2026.pdf" });
    expect(matchesQuery(x, "")).toBe(true);
    expect(matchesQuery(x, "abc 賃貸")).toBe(true);
    expect(matchesQuery(x, "ＡＢＣ")).toBe(true);
    expect(matchesQuery(x, "2026")).toBe(true);
    expect(matchesQuery(x, "abc cleaning")).toBe(false);
  });
});

describe("files", () => {
  it("checks type and size", () => {
    expect(checkFile({ name: "a.pdf", type: "application/pdf", size: 10 })).toEqual({ ok: true, type: "application/pdf" });
    expect(checkFile({ name: "a.JPG", type: "", size: 10 })).toEqual({ ok: true, type: "image/jpeg" });
    expect(checkFile({ name: "a.docx", type: "application/msword", size: 10 })).toEqual({ ok: false, why: "type" });
    expect(checkFile({ name: "a.pdf", type: "application/pdf", size: 16 * 1024 * 1024 })).toEqual({ ok: false, why: "size" });
    expect(checkFile({ name: "a.pdf", type: "application/pdf", size: 0 })).toEqual({ ok: false, why: "empty" });
  });
  it("makes safe paths in the contracts folder", () => {
    expect(safeFileName("สัญญา เช่า (1).PDF")).toBe("1.pdf");
    expect(safeFileName("賃貸.pdf")).toBe("file.pdf");
    expect(safeFileName("Lease ABC_2026.pdf")).toBe("Lease-ABC-2026.pdf");
    const p = contractFilePath(ID, "../x y.pdf", 123);
    expect(p).toBe(`contracts/${ID}/123-x-y.pdf`);
    expect(isContractPath(p)).toBe(true);
    expect(isContractPath(`${ID}/photo.jpg`)).toBe(false);
    expect(isContractPath(`contracts/${ID}/../x.pdf`)).toBe(false);
    expect(typeOfPath(p)).toBe("application/pdf");
    expect(typeOfPath("contracts/x/a.jpeg")).toBe("image/jpeg");
    expect(typeOfPath("contracts/x/a.gif")).toBeNull();
  });
});
