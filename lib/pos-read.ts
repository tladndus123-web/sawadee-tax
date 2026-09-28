"use client";

// Open a POS export in the browser: .xlsx (first sheet, via exceljs) or .csv / .txt (comma, semicolon or tab;
// UTF-8, or Thai Windows-874 when UTF-8 gives garbage). Old binary .xls is not supported — save it as .xlsx.

import { csvRows, rowsOfSheet } from "./pos-cells";
import type { Cell } from "./pos-import";

export { parseCsv } from "./pos-cells";

export class UnsupportedFile extends Error {}

export async function readPosFile(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) throw new UnsupportedFile("xls");
  if (name.endsWith(".xlsx") || file.type.includes("spreadsheetml")) return readXlsx(file);
  return readCsv(file);
}

async function readXlsx(file: File): Promise<Cell[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return rowsOfSheet(wb.worksheets[0]);
}

async function readCsv(file: File): Promise<Cell[][]> {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-874").decode(buf);
  return csvRows(text);
}
