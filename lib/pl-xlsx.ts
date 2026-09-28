"use client";

// The profit-and-loss table as an Excel file (exceljs loaded only on download): months across, money as numbers,
// bold totals, frozen header and first column; a second sheet with each figure as a share of that month's sales.

import { type PlRow, type PlTable, rowShares } from "./pl-table";

export interface PlLabels {
  sheet: string;
  item: string;
  total: string;
  sales: string;
  salesTotal: string;
  shareSheet: string;
  costs: string;
  costTotal: string;
  profit: string;
  month: (m: string) => string;
  channel: (k: string) => string;
  category: (k: string) => string;
}

export async function downloadPlXlsx(t: PlTable, L: PlLabels): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const sheet = (title: string, cells: (r: PlRow<unknown>) => (number | null)[], numFmt: string) => {
    const ws = wb.addWorksheet(title.slice(0, 31), { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    ws.columns = [{ width: 30 }, ...t.months.map(() => ({ width: 15 })), { width: 16 }];
    ws.addRow([L.item, ...t.months.map(L.month), L.total]).font = { bold: true };
    const put = (label: string, r: PlRow<unknown>, bold = false) => {
      const row = ws.addRow([label, ...cells(r)]);
      row.eachCell((c, i) => {
        if (i > 1) c.numFmt = numFmt;
      });
      if (bold) row.font = { bold: true };
    };
    const section = (label: string) => {
      ws.addRow([label]).font = { bold: true, color: { argb: "FF6B7280" } };
    };
    section(L.sales);
    t.sales.forEach((r) => put(`  ${L.channel(r.key)}`, r));
    put(L.salesTotal, t.salesTotal, true);
    ws.addRow([]);
    section(L.costs);
    t.costs.forEach((r) => put(`  ${L.category(r.key)}`, r));
    put(L.costTotal, t.costTotal, true);
    ws.addRow([]);
    put(L.profit, t.profit, true);
  };
  sheet(L.sheet, (r) => [...r.values, r.total], "#,##0.00");
  // Shares as real percentages (0.226 shown as 22.6%), empty where a month had no sales
  sheet(
    L.shareSheet,
    (r) => {
      const s = rowShares(r, t.salesTotal);
      return [...s.values, s.total].map((p) => (p === null ? null : p / 100));
    },
    "0.0%",
  );

  const name = `PL_${t.months[0]}_${t.months.at(-1)}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
