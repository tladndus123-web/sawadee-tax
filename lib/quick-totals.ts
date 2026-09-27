// The quick card shows only the grand total and the VAT. When either is typed there, the lines above them
// (taxable, and total / after discount / after deposit) are worked out again so the automatic checks still
// add up; discount, deposit, exempt and withholding stay as they were. Satang integers throughout.

import { fromSatang, toSatang } from "./money";
import type { LedgerDoc } from "./types";

type Totals = LedgerDoc["totals"];

/** VAT inside a VAT-inclusive total: net × 7 / 107 */
export const vatInside = (net: number): number => fromSatang(Math.round((toSatang(net) * 7) / 107));

export function quickTotals(t: Totals, net: number, vat: number): Totals {
  const n = toSatang(net);
  const v = toSatang(vat);
  const exempt = toSatang(t.exempt);
  const taxable = Math.max(0, n - v - exempt);
  const afterDep = taxable + exempt;
  const afterDisc = afterDep + toSatang(t.deposit);
  const total = afterDisc + toSatang(t.discount);
  return {
    ...t,
    net: fromSatang(n),
    vat: fromSatang(v),
    taxable: fromSatang(taxable),
    afterDep: fromSatang(afterDep),
    afterDisc: fromSatang(afterDisc),
    total: fromSatang(total),
  };
}
