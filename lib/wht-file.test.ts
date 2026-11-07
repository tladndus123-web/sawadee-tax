import { describe, expect, it } from "vitest";
import type { WhtRow } from "./wht";
import { cleanText, splitName, thaiDate, whtFileLines, whtFileName, whtFileText } from "./wht-file";

const row = (p: Partial<WhtRow>): WhtRow => ({
  id: "x", paidDate: "2026-10-12", taxId: "0105557035035", branchNo: "00000",
  name: { th: "บริษัท แพนฟู้ด จำกัด", en: "", ja: "" }, address: { th: "71/9 หมู่ 6 ต.ท่าทราย จ.สมุทรสาคร 74000", en: "", ja: "" },
  type: "service", rate: 3, paid: 60000, tax: 1800, ...p,
});

describe("RD Prep withholding file", () => {
  it("dates in the Buddhist year, text without forbidden characters", () => {
    expect(thaiDate("2026-10-12")).toBe("12/10/2569");
    expect(cleanText(`71/9, "A" & B`)).toBe("71-9 A B");
  });
  it("splits titles from names", () => {
    expect(splitName("บริษัท แพนฟู้ด จำกัด", "53")).toEqual({ title: "บริษัท", first: "แพนฟู้ด จำกัด", last: "" });
    expect(splitName("ห้างหุ้นส่วนจำกัด ขนส่งเร็ว", "53")).toEqual({ title: "ห้างหุ้นส่วนจำกัด", first: "ขนส่งเร็ว", last: "" });
    expect(splitName("นายสมชาย ใจดี", "3")).toEqual({ title: "นาย", first: "สมชาย", last: "ใจดี" });
    expect(splitName("นางสาว มาลี ศรีสุข", "3")).toEqual({ title: "นางสาว", first: "มาลี", last: "ศรีสุข" });
  });
  it("one line per payment after the column names, | between fields, CR/LF", () => {
    const lines = whtFileLines([row({})], "53");
    expect(lines[0][0]).toBe("ลำดับที่");
    expect(lines[1]).toEqual(["1", "0105557035035", "00000", "บริษัท", "แพนฟู้ด จำกัด", "71-9 หมู่ 6 ต.ท่าทราย จ.สมุทรสาคร 74000", "74000", "12/10/2569", "ค่าบริการ", "3.00", "60000.00", "1800.00", "1"]);
    const text = whtFileText([row({}), row({ type: "rent", rate: 5, paid: 12000, tax: 600 })], "53");
    expect(text.split("\r\n")).toHaveLength(4);
    expect(text.startsWith("ลำดับที่|")).toBe(true);
    expect(text).toContain("|ค่าเช่า|5.00|12000.00|600.00|1\r\n");
  });
  it("people get a surname column", () => {
    const l = whtFileLines([row({ taxId: "3101400778899", name: { th: "นายสมชาย ใจดี", en: "", ja: "" } })], "3");
    expect(l[0]).toContain("ชื่อสกุล");
    expect(l[1].slice(3, 6)).toEqual(["นาย", "สมชาย", "ใจดี"]);
  });
  it("names the file like the Revenue Department does", () => {
    expect(whtFileName("53", "0105557035035", "2026-10")).toBe("PND53_0105557035035_000000_2569_10_00_00.txt");
  });
});
