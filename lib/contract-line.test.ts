import { describe, expect, it } from "vitest";
import { contractFileType, contractWords, isContractFileName, isContractWord, lineDay, savedCardText } from "./contract-line";
import { isExpenseWord } from "./expense-line";
import { askFromText } from "./line-ask";
import { LINE_LANGS } from "./line-lang";

describe("trigger words", () => {
  it.each(["계약서", " 契約書 ", "สัญญา", "contract", "Contracts", "계약서 등록"])("%s starts contract mode", (w) => {
    expect(isContractWord(w)).toBe(true);
    expect(isExpenseWord(w)).toBe(false);
    expect(askFromText(w)).toBeNull();
  });
  it.each(["계약서 언제 끝나?", "contract ends when", "경비", "", "สัญญาเช่าหมดเมื่อไหร่"])("%s does not", (w) => {
    expect(isContractWord(w)).toBe(false);
  });
});

describe("files", () => {
  it("names", () => {
    expect(isContractFileName("lease.PDF")).toBe(true);
    expect(isContractFileName("scan.jpeg")).toBe(true);
    expect(isContractFileName("sales.xlsx")).toBe(false);
  });
  it("types from the first bytes", () => {
    expect(contractFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ type: "image/jpeg", ext: "jpg" });
    expect(contractFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ type: "image/png", ext: "png" });
    expect(contractFileType(new TextEncoder().encode("%PDF-1.7\n"))).toEqual({ type: "application/pdf", ext: "pdf" });
    expect(contractFileType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toEqual({ type: "image/webp", ext: "webp" });
    expect(contractFileType(new TextEncoder().encode("PK\x03\x04 zip"))).toBeNull();
  });
});

describe("words and card", () => {
  it("every language has every word", () => {
    const keys = Object.keys(contractWords("en")).sort();
    for (const l of LINE_LANGS) {
      expect(Object.keys(contractWords(l)).sort()).toEqual(keys);
      for (const v of Object.values(contractWords(l))) expect(v).toBeTruthy();
    }
  });
  it("days in each language", () => {
    expect(lineDay("2026-03-01", "ko")).toBe("2026.3.1");
    expect(lineDay("2026-03-01", "ja")).toBe("2026/3/1");
    expect(lineDay("2026-03-01", "th")).toBe("1/3/2569");
    expect(lineDay("2026-03-01", "en")).toBe("1/3/2026");
  });
  it("saved card: title, rows, link last", () => {
    const t = savedCardText({ title: "店舗の賃貸", party: "ABC Co., Ltd.", kind: "lease", startOn: "2026-01-01", endOn: "2026-12-31", autoRenew: true, noticeDays: 60, amount: 4_500_000, note: "" }, "https://x.test/contracts", "ja");
    const lines = t.split("\n");
    expect(lines[0]).toBe(contractWords("ja").saved);
    expect(lines[1]).toBe("店舗の賃貸");
    expect(lines).toContain("相手: ABC Co., Ltd.");
    expect(lines).toContain("種類: 賃貸借");
    expect(lines).toContain("期間: 2026/1/1 – 2026/12/31");
    expect(lines).toContain("金額: ฿45,000");
    expect(lines).toContain("自動更新: あり");
    expect(lines.at(-1)).toBe("https://x.test/contracts");
    // rows stay rows in noticeBubble: values ≤ 26 characters
    for (const l of lines.slice(2, -1)) expect(l.split(": ")[1].length).toBeLessThanOrEqual(26);
  });
  it("saved without the AI's fields", () => {
    expect(savedCardText(null, "https://x.test/contracts", "ko").split("\n")).toEqual([contractWords("ko").savedUnread, contractWords("ko").savedUnreadSub, "https://x.test/contracts"]);
  });
  it("a long party is cut to fit a row", () => {
    const t = savedCardText({ title: "T", party: "A".repeat(80), kind: "other", startOn: null, endOn: null, autoRenew: false, noticeDays: null, amount: null, note: "" }, "u", "en");
    expect(t.split("\n")[2]).toBe(`With: ${"A".repeat(25)}…`);
  });
});
