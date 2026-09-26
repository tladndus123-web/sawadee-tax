import { describe, expect, it } from "vitest";
import { buildMonthExport, exportLang } from "./export";
import { sampleDoc } from "./sample";
import type { LedgerDoc } from "./types";

const COMPANY = "0105557035035";
const doc = (patch: (d: LedgerDoc) => void = () => {}) => {
  const d = sampleDoc();
  patch(d);
  return { doc: d };
};

describe("monthly export", () => {
  it("uses the screen language and always keeps the Thai original", () => {
    expect(exportLang("ko")).toBe("en");
    expect(exportLang("ja")).toBe("ja");
    const en = buildMonthExport([doc()], "ko", COMPANY).rows[0];
    expect(en.vendor).toBe("PANFOOD CO., LTD.");
    expect(en.vendorTh).toBe("บริษัท แพนฟู้ด จำกัด");
    expect(buildMonthExport([doc()], "ja", COMPANY).rows[0].vendor).toBe("パンフード株式会社");
    expect(buildMonthExport([doc()], "ja", COMPANY).items[0].desc).toBe("冷凍生地 3.5kg × 6パック");
  });

  it("falls back to English, then Thai, when a translation is missing", () => {
    const r = buildMonthExport([doc((d) => (d.seller.name = { th: "ร้านไทย", en: "", ja: "" }))], "ja", COMPANY).rows[0];
    expect(r.vendor).toBe("ร้านไทย");
  });

  it("sorts by date and totals in satang", () => {
    const out = buildMonthExport(
      [
        doc((d) => ((d.date = "2026-09-20"), (d.totals.net = 0.1), (d.totals.vat = 0.07), (d.paid = true))),
        doc((d) => ((d.date = "2026-09-02"), (d.totals.net = 0.2), (d.totals.vat = 0.01))),
      ],
      "en",
      COMPANY,
    );
    expect(out.rows.map((r) => r.date)).toEqual(["2026-09-02", "2026-09-20"]);
    expect(out.totals.net).toBe(0.3);
    expect(out.totals.vat).toBe(0.08);
    expect(out.totals.unpaid).toBe(0.2);
    expect(out.totals.count).toBe(2);
  });

  it("counts only claimable VAT as refundable", () => {
    const out = buildMonthExport([doc(), doc((d) => (d.docType = "abbr"))], "en", COMPANY);
    expect(out.rows.map((r) => r.claimable)).toEqual([true, false]);
    expect(out.totals.claimableVat).toBe(4200);
    expect(out.totals.vat).toBe(8400);
    // Without our company tax ID nothing can be claimed
    expect(buildMonthExport([doc()], "en", "").totals.claimableVat).toBe(0);
  });

  it("lists every item line with its document", () => {
    const out = buildMonthExport([doc()], "en", COMPANY);
    expect(out.items).toEqual([
      expect.objectContaining({ docNo: "IV690923-0128", line: 1, code: "6F24100000", qty: 10, price: 6000, amount: 60000, unit: "Carton" }),
    ]);
  });
});
