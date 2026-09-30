"use client";

// Excel file for one month (step 7). exceljs is loaded only when someone downloads.
// Plain tables starting at row 1 (easy to import into accounting software), money as numbers
// with a 2-decimal format, a bold totals row, frozen header and filters.

import type { MonthExport } from "./export";

/** The month's costs by category (lib/cost-split monthCosts): the same figures as the P&L */
export interface CostSheet {
  rows: { label: string; amount: number }[];
  total: number;
}

export interface XlsxLabels {
  sheetLedger: string;
  sheetItems: string;
  cols: Record<string, string>;
  total: string;
  yes: string;
  no: string;
  docType: (k: string) => string;
  category: (k: string) => string;
  sheetCosts: string;
  cost: string;
}

const MONEY = "#,##0.00";

/** The month's shop sales, for the accountant's pack (one row per day and channel) */
export interface SalesSheet {
  title: string;
  cols: Record<"date" | "channel" | "docs" | "bills" | "gross" | "vat" | "net", string>;
  rows: { date: string; channel: string; docs: string; bills: number; gross: number; vat: number; net: number }[];
}

/** Extras of the accountant's pack: the photo file of each ledger row, and the sales sheet */
export interface PackExtras {
  fileCol: string;
  files: string[];
  sales?: SalesSheet;
}

export async function downloadMonthXlsx(data: MonthExport, month: string, thaiColumn: boolean, L: XlsxLabels, costs?: CostSheet): Promise<string> {
  const buf = await buildMonthXlsx(data, thaiColumn, L, costs);
  const file = `purchase-ledger-${month}.xlsx`;
  saveFile(new Blob([buf], { type: XLSX_TYPE }), file);
  return file;
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Hand a file to the browser as a download */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function buildMonthXlsx(data: MonthExport, thaiColumn: boolean, L: XlsxLabels, costs?: CostSheet, extras?: PackExtras): Promise<ArrayBuffer> {
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
    ...(extras ? [{ key: "file", width: 44 }] : []),
  ];
  ledger.columns = cols.map((c) => ({ header: c.key === "file" ? extras?.fileCol : L.cols[c.key], key: c.key, width: c.width, style: c.money ? { numFmt: MONEY } : {} }));
  for (const [n, r] of data.rows.entries()) {
    ledger.addRow({
      file: extras?.files[n] ?? "",
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
    { header: L.cols.category, key: "category", width: 18 },
  ];
  for (const i of data.items) items.addRow({ ...i, category: L.category(i.category) });
  items.getRow(1).font = { bold: true };

  // Sheet 3: the month's costs by category — mixed receipts split by line, equipment as depreciation
  if (costs) {
    const sheet = wb.addWorksheet(L.sheetCosts, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: L.cols.category, key: "label", width: 30 },
      { header: L.cost, key: "amount", width: 16, style: { numFmt: MONEY } },
    ];
    for (const r of costs.rows) sheet.addRow(r);
    const sum = sheet.addRow({ label: L.total, amount: costs.total });
    sum.font = { bold: true };
    sum.eachCell((c) => (c.border = { top: { style: "thin" } }));
    sheet.getRow(1).font = { bold: true };
  }

  // Sheet 4 (accountant's pack): the month's shop sales, for the output-tax side
  if (extras?.sales) {
    const s = extras.sales;
    const sheet = wb.addWorksheet(s.title, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: s.cols.date, key: "date", width: 12 },
      { header: s.cols.channel, key: "channel", width: 16 },
      { header: s.cols.docs, key: "docs", width: 24 },
      { header: s.cols.bills, key: "bills", width: 8 },
      { header: s.cols.gross, key: "gross", width: 15, style: { numFmt: MONEY } },
      { header: s.cols.vat, key: "vat", width: 13, style: { numFmt: MONEY } },
      { header: s.cols.net, key: "net", width: 15, style: { numFmt: MONEY } },
    ];
    for (const r of s.rows) sheet.addRow(r);
    const sum = (k: "gross" | "vat" | "net") => Math.round(s.rows.reduce((a, r) => a + Math.round(r[k] * 100), 0)) / 100;
    const tot = sheet.addRow({ date: L.total, bills: s.rows.reduce((a, r) => a + r.bills, 0), gross: sum("gross"), vat: sum("vat"), net: sum("net") });
    tot.font = { bold: true };
    tot.eachCell((c) => (c.border = { top: { style: "thin" } }));
    sheet.getRow(1).font = { bold: true };
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
