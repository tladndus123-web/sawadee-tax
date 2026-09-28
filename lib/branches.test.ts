import { describe, expect, it } from "vitest";
import { ALL, assignBranch, branchFromPhoto, branchLabel, sortBranches } from "./branches";
import { sampleDoc } from "./sample";

const head = { id: "h", no: "00000", name: "", sort: 0 };
const silom = { id: "s", no: "00001", name: "Silom", sort: 1 };
const asok = { id: "a", no: "00002", name: "", sort: 2 };
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
