import { describe, expect, it } from "vitest";
import { cleanConclusion, cleanPlSheet } from "./pl-ai";
import type { PlSheet } from "./pl-insight";

const sheet: PlSheet = {
  months: [
    { month: "2026-09", sales: 500000, costs: 420000, profit: 80000, profitPct: 16, incomplete: [] },
    { month: "2026-10", sales: 520000, costs: 470000, profit: 50000, profitPct: 9.6, incomplete: [] },
    { month: "2026-11", sales: 300000, costs: 150000, profit: 150000, profitPct: 50, incomplete: ["running", "labor"] },
  ],
  rows: [{ name: "Food", target: 35, shares: [33.2, 38.5, 20] }],
};

describe("P&L one-line AI conclusion", () => {
  it("keeps an answer with the sheet's numbers and point changes", () => {
    const c = cleanConclusion({ headline: "October left ฿50,000 (9.6%), down from 16%.", reasons: ["Food rose 5.3 points to 38.5%, above the 35% target.", "November is not over."] }, sheet);
    expect(c?.reasons).toHaveLength(2);
  });
  it("drops a made-up figure", () => {
    expect(cleanConclusion({ headline: "Profit fell ฿31,000.", reasons: [] }, sheet)).toBeNull();
    expect(cleanConclusion({ headline: "", reasons: ["x"] }, sheet)).toBeNull();
  });
  it("cleans what the browser sends", () => {
    expect(cleanPlSheet({ months: [] })).toBeNull();
    const s = cleanPlSheet({ months: [{ month: "2026-11-01", sales: "1", incomplete: ["running", "hack"] }], rows: [{ name: "A", shares: [1, "x"] }] });
    expect(s?.months[0]).toMatchObject({ month: "2026-11", sales: 0, incomplete: ["running"] });
    expect(s?.rows[0].shares).toEqual([1, null]);
  });
});
