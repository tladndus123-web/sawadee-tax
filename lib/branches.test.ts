import { describe, expect, it } from "vitest";
import { ALL, assignBranch, branchFromPhoto, branchLabel, branchSummaries, colorOf, sortBranches } from "./branches";
import { sampleDoc } from "./sample";

const head = { id: "h", no: "00000", name: "", sort: 0, color: "" };
const silom = { id: "s", no: "00001", name: "Silom", sort: 1, color: "" };
const asok = { id: "a", no: "00002", name: "", sort: 2, color: "pink" };
const all = [silom, asok, head];
const withBuyerBranch = (no: string) => ({ ...sampleDoc(), customer: { ...sampleDoc().customer, branch: { th: `สาขาที่ ${no}`, en: "", ja: "" } } });

describe("which branch a document belongs to", () => {
  it("keeps a branch it already has", () => {
    expect(assignBranch({ ...sampleDoc(), branchId: "a" }, all, "s").branchId).toBe("a");
  });
  it("a branch it names that no longer exists is replaced (by the printed one, here the head office)", () => {
    expect(assignBranch({ ...sampleDoc(), branchId: "gone" }, all, "s").branchId).toBe("h");
    const plain = { ...sampleDoc(), branchId: "gone", customer: { ...sampleDoc().customer, branch: { th: "", en: "", ja: "" } } };
    expect(assignBranch(plain, all, "s").branchId).toBe("s");
  });
  it("the buyer's branch number on the invoice wins over the branch the person works in", () => {
    expect(assignBranch(withBuyerBranch("00002"), all, "s").branchId).toBe("a");
    expect(branchFromPhoto(withBuyerBranch("00002"), all)?.id).toBe("a");
  });
  it("head office printed → head office", () => {
    const doc = { ...sampleDoc(), customer: { ...sampleDoc().customer, branch: { th: "สำนักงานใหญ่", en: "", ja: "" } } };
    expect(assignBranch(doc, all, "s").branchId).toBe("h");
  });
  it("nothing printed: the branch the person works in, else the head office", () => {
    const doc = { ...sampleDoc(), customer: { ...sampleDoc().customer, branch: { th: "", en: "", ja: "" } } };
    expect(assignBranch(doc, all, "a").branchId).toBe("a");
    expect(assignBranch(doc, all, ALL).branchId).toBe("h");
    expect(branchFromPhoto(doc, all)).toBeNull();
  });
  it("a printed branch the company has not set up is ignored", () => {
    expect(assignBranch(withBuyerBranch("00007"), all, "s").branchId).toBe("s");
  });
  it("no branches yet → nothing set (the database uses the head office)", () => {
    expect(assignBranch(sampleDoc(), [], ALL).branchId).toBe("");
  });
});

describe("branch names and order", () => {
  const t = { head: "본점", branch: (no: string) => `지점 ${no}` };
  it("a name if set, else head office / branch number", () => {
    expect(branchLabel(silom, t)).toBe("Silom");
    expect(branchLabel(head, t)).toBe("본점");
    expect(branchLabel(asok, t)).toBe("지점 00002");
  });
  it("head office first, then by sort", () => {
    expect(sortBranches(all).map((b) => b.id)).toEqual(["h", "s", "a"]);
  });
});

describe("branch colours", () => {
  it("automatic by place in the list; a chosen one wins", () => {
    expect(colorOf(head, all)).toBe("blue");
    expect(colorOf(silom, all)).toBe("orange");
    expect(colorOf(asok, all)).toBe("pink");
    expect(colorOf({ ...silom, color: "nonsense" }, all)).toBe("orange");
  });
});

describe("the combined board: each branch and all together", () => {
  const CO = "0105557035035";
  const doc = (branchId: string) => ({ ...sampleDoc(), branchId, date: "2026-09-10", customer: { ...sampleDoc().customer, taxId: CO } });
  const sale = (branchId: string, gross: number, vat: number) => ({ id: branchId + gross, branchId, date: "2026-09-05", channel: "store" as const, docFrom: "", docTo: "", bills: 0, gross, vat, exempt: 0, note: "", photoPath: null, source: "manual" as const });
  it("each branch has its own month; rows without a branch are the head office; the total adds up", () => {
    const { rows, total } = branchSummaries(all, [doc("s"), doc("")], [sale("s", 10700, 700), sale("a", 21400, 1400)], "2026-09", CO);
    const by = Object.fromEntries(rows.map((r) => [r.branch.id, r.result]));
    expect(rows.map((r) => r.branch.id)).toEqual(["h", "s", "a"]);
    expect(by.s.salesValue).toBe(10000);
    expect(by.s.purchasesCost).toBe(60000);
    expect(by.h.purchasesCost).toBe(60000);
    expect(by.a.salesValue).toBe(20000);
    expect(total.salesValue).toBe(by.h.salesValue + by.s.salesValue + by.a.salesValue);
    expect(total.profit).toBe(by.h.profit + by.s.profit + by.a.profit);
    // Each branch's own costs by category, for its F / L / R shares
    const s = rows.find((r) => r.branch.id === "s")!;
    expect([...s.costs.byCategory.values()].reduce((a, v) => a + v, 0)).toBe(6000000);
    expect(rows.find((r) => r.branch.id === "a")!.costs.byCategory.size).toBe(0);
  });
});
