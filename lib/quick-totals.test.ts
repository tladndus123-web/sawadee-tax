import { describe, expect, it } from "vitest";
import { runChecks } from "./checks";
import { normalize } from "./normalize";
import { quickTotals, vatInside } from "./quick-totals";

const zero = normalize({}).totals;

describe("quick card totals", () => {
  it("finds the 7% VAT inside a total", () => {
    expect(vatInside(64200)).toBe(4200);
    expect(vatInside(107)).toBe(7);
    expect(vatInside(100)).toBe(6.54);
  });

  it("rebuilds the lines above so the chain, VAT and net checks pass", () => {
    const t = quickTotals(zero, 64200, 4200);
    expect(t).toMatchObject({ net: 64200, vat: 4200, taxable: 60000, afterDep: 60000, afterDisc: 60000, total: 60000 });
    const doc = normalize({ totals: t });
    const failing = runChecks(doc).filter((c) => ["chain", "vat", "net"].includes(c.key) && !c.ok).map((c) => c.key);
    expect(failing).toEqual([]);
  });

  it("keeps discount, deposit and exempt, and never goes below zero", () => {
    const t = quickTotals({ ...zero, discount: 100, deposit: 50, exempt: 30 }, 1100, 70);
    expect(t).toMatchObject({ taxable: 1000, afterDep: 1030, afterDisc: 1080, total: 1180, exempt: 30, discount: 100, deposit: 50 });
    expect(quickTotals(zero, 5, 10).taxable).toBe(0);
  });
});
