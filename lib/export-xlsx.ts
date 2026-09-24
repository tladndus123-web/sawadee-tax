"use client";

// Excel file for one month (step 7). exceljs is loaded only when someone downloads.
// Plain tables starting at row 1 (easy to import into accounting software), money as numbers
// with a 2-decimal format, a bold totals row, frozen header and filters.

import type { MonthExport } from "./export";

export interface XlsxLabels {
  sheetLedger: string;
  sheetItems: string;
  cols: Record<string, string>;
  total: string;
  yes: string;
  no: string;
  docType: (k: string) => string;
  category: (k: string) => string;
}

const MONEY = "#,##0.00";

export async function downloadMonthXlsx(data: MonthExport, month: string, thaiColumn: boolean, L: XlsxLabels): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // Sheet 1: one row per document
  const ledger = wb.addWorksheet(L.sheetLedger, { views: [{ state: "frozen", ySplit: 1 }] });
  const cols: { key: string; width: number; money?: boolean }[] = [
    { key: "date", width: 12 },
    { key: "docNo", width: 18 },
    { key: "vendor", width: 34 },
    ...(thaiColumn ? [{ key: "vendorTh", width: 34 }] : []),
    { key: "taxId", width: 16 },
    { key: "branch", width: 18 },
    { key: "docType", width: 22 },
    { key: "category", width: 16 },
    { key: "items", width: 40 },
    { key: "taxable", width: 14, money: true },
    { key: "exempt", width: 14, money: true },
    { key: "vat", width: 13, money: true },
    { key: "net", width: 15, money: true },
    { key: "wht", width: 13, money: true },
    { key: "paid", width: 8 },
    { key: "paidDate", width: 12 },
    { key: "claimable", width: 10 },
    { key: "flags", width: 9 },
  ];
  ledger.columns = cols.map((c) => ({ header: L.cols[c.key], key: c.key, width: c.width, style: c.money ? { numFmt: MONEY } : {} }));
  for (const r of data.rows) {
    ledger.addRow({
      ...r,
      docType: L.docType(r.docType),
      category: L.category(r.category),
      paid: r.paid ? L.yes : L.no,
      claimable: r.claimable ? L.yes : L.no,
      flags: r.flags || "",
    });
  }
  const tot = ledger.addRow({
    date: L.total,
    taxable: data.totals.taxable,
    exempt: data.totals.exempt,
    vat: data.totals.vat,
    net: data.totals.net,
    wht: data.totals.wht,
  });
  tot.font = { bold: true };
  tot.eachCell((c) => (c.border = { top: { style: "thin" } }));
  ledger.getRow(1).font = { bold: true };
  ledger.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  // Sheet 2: one row per item line
  const items = wb.addWorksheet(L.sheetItems, { views: [{ state: "frozen", ySplit: 1 }] });
  items.columns = [
    { header: L.cols.date, key: "date", width: 12 },
    { header: L.cols.docNo, key: "docNo", width: 18 },
    { header: L.cols.vendor, key: "vendor", width: 30 },
    { header: L.cols.line, key: "line", width: 6 },
    { header: L.cols.code, key: "code", width: 16 },
    { header: L.cols.desc, key: "desc", width: 36 },
    ...(thaiColumn ? [{ header: L.cols.descTh, key: "descTh", width: 36 }] : []),
    { header: L.cols.qty, key: "qty", width: 9, style: { numFmt: "#,##0.####" } },
    { header: L.cols.unit, key: "unit", width: 10 },
    { header: L.cols.price, key: "price", width: 13, style: { numFmt: MONEY } },
    { header: L.cols.amount, key: "amount", width: 14, style: { numFmt: MONEY } },
  ];
  for (const i of data.items) items.addRow(i);
  items.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  const file = `purchase-ledger-${month}.xlsx`;
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return file;
}
