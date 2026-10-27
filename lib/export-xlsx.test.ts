import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildMonthExport } from "./export";
import { buildMonthXlsx, type XlsxLabels } from "./export-xlsx";
import { normalize } from "./normalize";

const L: XlsxLabels = {
  sheetLedger: "Ledger",
  sheetItems: "Items",
  cols: new Proxy({}, { get: (_t, k) => `[${String(k)}]` }) as Record<string, string>,
  total: "Total",
  yes: "Y",
  no: "N",
  docType: (k) => k,
  category: (k) => k,
  sheetCosts: "Costs",
  cost: "Cost",
};
const data = buildMonthExport([{ doc: normalize({ date: "2026-10-20", docNo: "A1", seller: { name: { en: "MAKRO", th: "แม็คโคร" } }, totals: { net: 107, vat: 7, taxable: 100 } }), flags: 0 }], "en", "");
const headers = async (buf: ArrayBuffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return (wb.getWorksheet("Ledger")!.getRow(1).values as unknown[]).slice(1);
};

describe("the ledger Excel", () => {
  it("has the usual columns without a layout", async () => {
    const h = await headers(await buildMonthXlsx(data, false, L));
    expect(h[0]).toBe("[date]");
    expect(h).not.toContain("[vendorTh]");
  });
  it("follows the accountant's layout: only those columns, in that order, with their headings", async () => {
    const h = await headers(await buildMonthXlsx(data, true, { ...L, format: { cols: [{ key: "net", label: "ยอดสุทธิ" }, { key: "date", label: "" }, { key: "vendorTh", label: "ผู้ขาย" }] } }));
    expect(h).toEqual(["ยอดสุทธิ", "[date]", "ผู้ขาย"]);
  });
});
