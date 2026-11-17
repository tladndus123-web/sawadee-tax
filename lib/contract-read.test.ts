import { describe, expect, it } from "vitest";
import { cleanContractReading, contractSystemPrompt, readDay, readingToFields, readLangOf } from "./contract-read";

describe("readDay", () => {
  it("ISO, Buddhist years and day/month/year", () => {
    expect(readDay("2026-03-01")).toBe("2026-03-01");
    expect(readDay("2569-03-01")).toBe("2026-03-01");
    expect(readDay("01/03/2569")).toBe("2026-03-01");
    expect(readDay("1.3.2026")).toBe("2026-03-01");
    expect(readDay("")).toBeNull();
    expect(readDay("2026-02-30")).toBeNull();
    expect(readDay(42)).toBeNull();
  });
});

describe("cleanContractReading", () => {
  it("cleans a good answer (amount to satang)", () => {
    const r = cleanContractReading({ title: "  店舗の賃貸  ", party: "ABC", kind: "lease", startOn: "2569-01-01", endOn: "2026-12-31", autoRenew: true, noticeDays: 60.4, amount: 45000.5, note: "家賃 月 ฿45,000" });
    expect(r).toEqual({ title: "店舗の賃貸", party: "ABC", kind: "lease", startOn: "2026-01-01", endOn: "2026-12-31", autoRenew: true, noticeDays: 60, amount: 4_500_050, note: "家賃 月 ฿45,000" });
  });
  it("drops what is not there or odd", () => {
    const r = cleanContractReading({ title: "X", party: 3, kind: "marriage", startOn: "", endOn: "soon", autoRenew: "yes", noticeDays: 0, amount: 0, note: null });
    expect(r).toEqual({ title: "X", party: "", kind: "other", startOn: null, endOn: null, autoRenew: false, noticeDays: null, amount: null, note: "" });
  });
  it("a start after the end keeps neither", () => {
    const r = cleanContractReading({ title: "X", startOn: "2027-01-01", endOn: "2026-01-01" });
    expect(r?.startOn).toBeNull();
    expect(r?.endOn).toBeNull();
  });
  it("caps notice days and long texts", () => {
    const r = cleanContractReading({ title: "t".repeat(300), noticeDays: 5000 });
    expect(r?.title).toHaveLength(120);
    expect(r?.noticeDays).toBe(365);
  });
  it("no title = not a contract", () => {
    expect(cleanContractReading({ title: "" })).toBeNull();
    expect(cleanContractReading(null)).toBeNull();
    expect(cleanContractReading("text")).toBeNull();
  });
});

describe("form and prompt", () => {
  it("reading → the form's fields (baht)", () => {
    const f = readingToFields({ title: "A", party: "B", kind: "service", startOn: null, endOn: "2027-01-31", autoRenew: false, noticeDays: null, amount: 1_234_550, note: "" });
    expect(f).toEqual({ title: "A", party: "B", kind: "service", startOn: "", endOn: "2027-01-31", autoRenew: false, noticeDays: null, amount: "12345.5", note: "" });
  });
  it("prompt names the language, today and the Buddhist year rule", () => {
    const p = contractSystemPrompt("ko", "2026-11-18");
    expect(p).toContain("Korean");
    expect(p).toContain("2026-11-18");
    expect(p).toContain("minus 543");
    expect(readLangOf("th")).toBe("th");
    expect(readLangOf("zh")).toBe("ja");
  });
});
