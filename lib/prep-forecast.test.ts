import { describe, expect, it } from "vitest";
import { closedWeekdays, dailySales, prepForecast, prepIngredients, prepQty } from "./prep-forecast";
import type { Sale } from "./sales";
import type { LedgerDoc } from "./types";

const DAY = 86_400_000;
const back = (today: string, n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
const TODAY = "2026-11-18"; // a Wednesday

// 8 weeks: Saturdays 2x a usual day, Mondays closed, other days 10,000
function history() {
  const m = new Map<string, number>();
  for (let n = 1; n <= 56; n++) {
    const d = back(TODAY, n);
    const w = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (w === 1) continue;
    m.set(d, w === 6 ? 20000 : 10000);
  }
  return m;
}

describe("prep forecast", () => {
  it("adds up a day's sales without VAT for the chosen branches", () => {
    const s = (branchId: string, gross: number) => ({ branchId, date: "2026-11-01", gross, vat: 70, channel: "store" }) as unknown as Sale;
    expect(dailySales([s("a", 1070), s("a", 1070), s("b", 1070)], ["a"]).get("2026-11-01")).toBe(2000);
  });
  it("finds closed weekdays from the sales and the setting", () => {
    expect([...closedWeekdays(history(), TODAY)]).toEqual([1]);
    expect([...closedWeekdays(history(), TODAY, [0])].sort()).toEqual([0, 1]);
  });
  it("forecasts the next days against a usual day", () => {
    const f = prepForecast(history(), TODAY);
    expect(f.enough).toBe(true);
    const sat = f.days.find((d) => d.day === "2026-11-21")!;
    const mon = f.days.find((d) => d.day === "2026-11-23")!;
    const thu = f.days[0];
    expect(mon.advice).toBe("closed");
    expect(sat.advice).toBe("more");
    expect(sat.expected).toBeGreaterThan(thu.expected * 1.8);
    expect(thu.advice).toBe("less");
  });
  it("says nothing without enough days", () => {
    expect(prepForecast(new Map([[back(TODAY, 1), 5000]]), TODAY).enough).toBe(false);
  });
  it("rounds quantities the way a cook measures", () => {
    expect(prepQty(1.21, "kg")).toBe(1.3);
    expect(prepQty(123, "g")).toBe(130);
    expect(prepQty(2.1, "pcs")).toBe(3);
    expect(prepQty(0, "kg")).toBe(0);
  });
  it("reads ingredient use from food purchases", () => {
    const f = prepForecast(history(), TODAY);
    const doc = (date: string, name: string, qty: number, amount: number, category = "food") =>
      ({ date, category, items: [{ category: "", desc: { th: name, en: "", ja: "" }, unit: { th: "kg", en: "", ja: "" }, qty, amount }] }) as unknown as LedgerDoc;
    const list = prepIngredients([doc(back(TODAY, 3), "หมู", 28, 4200), doc(back(TODAY, 10), "หมู", 28, 4200), doc(back(TODAY, 5), "กระดาษ", 50, 900, "supplies"), doc(back(TODAY, 40), "ไก่", 99, 9999)], new Set(["food"]), TODAY, f);
    expect(list.map((i) => i.name)).toEqual(["หมู"]);
    expect(list[0].perDay).toBe(2);
    expect(list[0].tomorrow).toBeGreaterThan(0);
  });
});
