import { describe, expect, it } from "vitest";
import { cleanBrief, cleanSheet, numbersOk, type PrepSheet } from "./prep-brief";

const sheet: PrepSheet = {
  usual: 52000,
  weekPct: 8,
  days: [{ day: "2026-11-19", weekday: "Thursday", expected: 48000, pct: -8, advice: "usual" }],
  ingredients: [{ name: "หมู", unit: "kg", tomorrow: 2.5 }],
};

describe("prep brief", () => {
  it("keeps only numbers from the sheet", () => {
    expect(numbersOk("Tomorrow about ฿48,000 (-8%), prep 2.5 kg pork", sheet)).toBe(true);
    expect(numbersOk("Tomorrow about ฿49,000", sheet)).toBe(false);
  });
  it("drops a reply with a made-up figure, keeps a good one", () => {
    expect(cleanBrief({ summary: "Usual day ฿52,000.", actions: ["Prep 2.5 kg pork", "", 5] }, sheet)).toEqual({ summary: "Usual day ฿52,000.", actions: ["Prep 2.5 kg pork"] });
    expect(cleanBrief({ summary: "Expect ฿60,000", actions: [] }, sheet)).toBeNull();
    expect(cleanBrief({ summary: "", actions: [] }, sheet)).toBeNull();
  });
  it("checks what the browser sends", () => {
    expect(cleanSheet({ usual: "x", weekPct: 1, days: [{}] })).toBeNull();
    expect(cleanSheet({ usual: 1, weekPct: 1, days: [] })).toBeNull();
    const s = cleanSheet({ usual: 100, weekPct: 2, days: Array(9).fill({ day: "2026-11-19", expected: 1 }), ingredients: [{ name: "x".repeat(99), tomorrow: 1 }] })!;
    expect(s.days).toHaveLength(7);
    expect(s.ingredients[0].name).toHaveLength(60);
  });
});
