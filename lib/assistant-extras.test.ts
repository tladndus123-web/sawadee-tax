import { describe, expect, it } from "vitest";
import { extrasLines, type ExtrasInput } from "./assistant-extras";
import { rowToContract } from "./contracts";
import { readFoodFeatures } from "./food-features";
import type { LedgerDoc } from "./types";
import { rowToWaste } from "./waste";

const doc = (o: Partial<LedgerDoc> & { net: number }) =>
  ({ docNo: "IV1", date: "2026-11-02", dueDate: "", paid: false, category: "food", items: [], seller: { name: { th: "", en: "Makro", ja: "" }, taxId: "" }, note: { th: "", en: "", ja: "" }, totals: { net: o.net, wht: 0, vat: 0 }, whtRate: 0, ...o }) as unknown as LedgerDoc;

const base: ExtrasInput = {
  today: "2026-11-18",
  appUrl: "https://app.test",
  saved: [{ id: "a", doc: doc({ net: 1000, dueDate: "2026-11-10" }) }, { id: "b", doc: doc({ net: 500, dueDate: "2026-11-20", paid: true }) }],
  sales: [],
  payroll: [{ month: "2026-10", wht: 100, ssEmployee: 750, ssEmployer: 750 }],
  done: new Set(["vat:2026-10"]),
  contracts: [rowToContract({ id: "c1", title: "Shop lease", party: "Owner Co", kind: "lease", start_on: "2024-12-01", end_on: "2026-12-31", auto_renew: true, notice_days: 60, amount: 4500000, created_at: "2026-01-01" })],
  waste: [rowToWaste({ id: "w1", day: "2026-11-03", item: "Milk", qty: 2, amount: 90, reason: "spoiled" })],
  features: readFoodFeatures({}),
  foodKeys: new Set(["food"]),
  closedDays: [],
};

describe("assistant extras", () => {
  it("tells the bills to pay, the tax month and the contracts", () => {
    const text = extrasLines(base).join("\n");
    expect(text).toContain("Late 1000 (1)");
    expect(text).toContain("https://app.test/ledger/payables");
    expect(text).toContain("Tax returns for 2026-10");
    expect(text).toMatch(/VAT ภ\.พ\.30: e-filing by 2026-11-2\d .* — filed\./);
    expect(text).toContain("Payroll ภ.ง.ด.1 tax 100 + social security 1500");
    expect(text).toContain("Shop lease with Owner Co (lease)");
    expect(text).toContain("give notice by 2026-11-01");
    expect(text).toContain("amount 45000");
  });
  it("leaves the restaurant extras out until they are on", () => {
    expect(extrasLines(base).join("\n")).not.toContain("Waste log");
    const on = extrasLines({ ...base, features: readFoodFeatures({ waste: true, prep: true, delivery: true }) }).join("\n");
    expect(on).toContain("Waste log this month");
    expect(on).toContain("90 in 1 record(s)");
  });
});
