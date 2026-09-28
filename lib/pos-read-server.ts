// Open a POS export on the server (a file sent to the LINE bot): the same rows as lib/pos-read gives the browser.

import { csvRows, rowsOfSheet } from "./pos-cells";
import type { Cell } from "./pos-import";

export const isPosFileName = (name: string) => /\.(xlsx|csv|txt)$/i.test(name);

export async function readPosBuffer(buf: Buffer, fileName: string): Promise<Cell[][]> {
  if (/\.xlsx$/i.test(fileName)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    return rowsOfSheet(wb.worksheets[0]);
  }
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-874").decode(buf);
  return csvRows(text);
}
