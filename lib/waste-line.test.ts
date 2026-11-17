import { describe, expect, it } from "vitest";
import { isWasteWord, readWasteLine } from "./waste-line";

describe("waste on LINE", () => {
  it("starts on the four words", () => {
    for (const w of ["폐기", " 廃棄 ", "ทิ้ง", "Waste"]) expect(isWasteWord(w)).toBe(true);
    expect(isWasteWord("폐기 우유")).toBe(false);
  });
  it("reads item, quantity, unit, reason and value", () => {
    expect(readWasteLine("우유 2L 상함 ฿90")).toEqual({ item: "우유", qty: 2, unit: "L", reason: "spoiled", amount: 90 });
    expect(readWasteLine("牛乳 1.5 kg 期限切れ 120バーツ")).toEqual({ item: "牛乳", qty: 1.5, unit: "kg", reason: "expired", amount: 120 });
    expect(readWasteLine("หมู 3 กก. ทำพลาด 450 บาท")).toEqual({ item: "หมู", qty: 3, unit: "กก.", reason: "mistake", amount: 450 });
    expect(readWasteLine("pork belly dropped")).toEqual({ item: "pork belly", qty: 1, unit: "", reason: "dropped", amount: null });
    expect(readWasteLine("빵 5개")).toEqual({ item: "빵", qty: 5, unit: "개", reason: "other", amount: null });
  });
  it("needs an item", () => {
    expect(readWasteLine("2kg ฿50")).toBeNull();
    expect(readWasteLine("   ")).toBeNull();
  });
});
