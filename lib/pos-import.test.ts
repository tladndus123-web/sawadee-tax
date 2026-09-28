import { describe, expect, it } from "vitest";
import { aggregate, channelOf, detectColumns, findHeader, parseDateCell, parseMoney } from "./pos-import";

describe("POS file columns", () => {
  it("finds Thai headers", () => {
    expect(detectColumns(["วันที่", "เลขที่ใบเสร็จ", "ช่องทาง", "มูลค่าก่อนภาษี", "ภาษีมูลค่าเพิ่ม", "ยอดขายสุทธิ"])).toEqual({ date: 0, receipt: 1, channel: 2, preVat: 3, vat: 4, gross: 5 });
  });
  it("finds English headers and keeps 'Gross sales' / discounts out of the total", () => {
    const m = detectColumns(["Business Date", "Gross Sales", "Discount", "Net Sales", "VAT 7%", "No. of Bills"]);
    expect(m).toMatchObject({ date: 0, gross: 3, vat: 4, bills: 5 });
  });
  it("finds the header row below a title block", () => {
    const rows = [["Daily Sales Report"], ["Shop: Truffle Donuts"], [], ["Date", "Receipt No", "Total", "Tax"], ["26/09/2026", "R1", "107", "7"]];
    expect(findHeader(rows)).toEqual({ index: 3, map: { date: 0, receipt: 1, gross: 2, vat: 3 } });
    expect(findHeader([["name", "qty"]])).toBeNull();
  });
});

describe("POS cell values", () => {
  it("reads dates in Thai, ISO, Buddhist, Excel and month-name forms", () => {
    expect(parseDateCell("26/09/2569")).toBe("2026-09-26");
    expect(parseDateCell("26/09/69", 2026)).toBe("2026-09-26");
    expect(parseDateCell("26/09/26", 2026)).toBe("2026-09-26");
    expect(parseDateCell("2026-09-26 21:15")).toBe("2026-09-26");
    expect(parseDateCell("26-09-2026 08:00")).toBe("2026-09-26");
    expect(parseDateCell(46291)).toBe("2026-09-26");
    expect(parseDateCell(new Date(Date.UTC(2026, 8, 26)))).toBe("2026-09-26");
    expect(parseDateCell("26 Sep 2026")).toBe("2026-09-26");
    expect(parseDateCell("26 ก.ย. 2569")).toBe("2026-09-26");
    expect(parseDateCell("Total")).toBeNull();
    expect(parseDateCell("31/02/2026")).toBeNull();
  });
  it("reads money", () => {
    expect(parseMoney("1,234.50")).toBe(1234.5);
    expect(parseMoney("฿ 99")).toBe(99);
    expect(parseMoney("(12.00)")).toBe(-12);
    expect(parseMoney("-")).toBe(0);
    expect(parseMoney(42)).toBe(42);
  });
  it("names delivery apps", () => {
    expect(channelOf("GrabFood", "store")).toBe("grab");
    expect(channelOf("LINE MAN Wongnai", "store")).toBe("lineman");
    expect(channelOf("Dine-in", "store")).toBe("store");
    expect(channelOf("", "grab")).toBe("grab");
  });
});

describe("adding up the rows", () => {
  it("one row per receipt → one line per day and channel, receipt range and count", () => {
    const map = { date: 0, receipt: 1, channel: 2, gross: 3, vat: 4 };
    const rows = [
      ["26/09/2026 10:01", "ABB-0412", "หน้าร้าน", "107.00", "7.00"],
      ["26/09/2026 12:30", "ABB-0413", "หน้าร้าน", "214.00", "14.00"],
      ["26/09/2026 13:00", "G-9", "GrabFood", "321.00", "21.00"],
      ["27/09/2026 09:00", "ABB-0414", "หน้าร้าน", "(107.00)", "(7.00)"],
      ["รวม", "", "", "535.00", "35.00"],
    ];
    const { days, skipped } = aggregate(rows, map);
    expect(skipped).toBe(1);
    expect(days).toEqual([
      { date: "2026-09-26", channel: "grab", gross: 321, vat: 21, exempt: 0, bills: 1, docFrom: "G-9", docTo: "G-9", vatComputed: false, rows: 1 },
      { date: "2026-09-26", channel: "store", gross: 321, vat: 21, exempt: 0, bills: 2, docFrom: "ABB-0412", docTo: "ABB-0413", vatComputed: false, rows: 2 },
      { date: "2026-09-27", channel: "store", gross: -107, vat: -7, exempt: 0, bills: 1, docFrom: "ABB-0414", docTo: "ABB-0414", vatComputed: false, rows: 1 },
    ]);
  });

  it("one row per day, VAT from the pre-VAT column or worked out at 7/107", () => {
    expect(aggregate([["2026-09-26", "12,840.00", "12,000.00", 57]], { date: 0, gross: 1, preVat: 2, bills: 3 }).days[0]).toMatchObject({ gross: 12840, vat: 840, bills: 57, vatComputed: false });
    expect(aggregate([["2026-09-26", "10,700"]], { date: 0, gross: 1 }).days[0]).toMatchObject({ vat: 700, vatComputed: true, bills: 1 });
  });

  it("receipt numbers sort as numbers, not text", () => {
    const { days } = aggregate([["2026-09-26", "R10", "1"], ["2026-09-26", "R9", "1"], ["2026-09-26", "R100", "1"]], { date: 0, receipt: 1, gross: 2 });
    expect([days[0].docFrom, days[0].docTo]).toEqual(["R9", "R100"]);
  });
});

describe("CSV", async () => {
  const { parseCsv } = await import("./pos-read");
  it("handles quotes, separators inside quotes and CRLF", () => {
    expect(parseCsv('Date,Total\r\n26/09/2026,"1,070.00"\r\n"a ""b""",2\r\n')).toEqual([["Date", "Total"], ["26/09/2026", "1,070.00"], ['a "b"', "2"]]);
    expect(parseCsv("a;b\n1;2", ";")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("column memory", async () => {
  const { applySavedColumns, columnsToSave, posColumnsOf } = await import("./pos-import");
  const headers = ["Business Date", "Gross Sales", "Discount", "Net Sales", "VAT 7%", "No. of Bills"];
  it("remembers the header text of each matched column", () => {
    expect(columnsToSave(headers, { date: 0, gross: 3, vat: 4, bills: 5 })).toEqual({ date: "Business Date", gross: "Net Sales", vat: "VAT 7%", bills: "No. of Bills" });
    expect(posColumnsOf({ date: "Date", gross: 1, bogus: "x" })).toEqual({ date: "Date" });
  });
  it("a remembered header overrides the automatic match, and frees the column it takes", () => {
    // The person had chosen "Gross Sales" as the total (their POS puts the net there)
    const map = applySavedColumns(headers, { date: 0, gross: 3, vat: 4, bills: 5 }, { gross: "gross sales" });
    expect(map).toEqual({ date: 0, gross: 1, vat: 4, bills: 5 });
    // Nothing remembered for this file's headers: the automatic match stays
    expect(applySavedColumns(headers, { date: 0, gross: 3 }, { gross: "ยอดขายสุทธิ" })).toEqual({ date: 0, gross: 3 });
  });
});

describe("server reader", async () => {
  const { readPosBuffer, isPosFileName } = await import("./pos-read-server");
  it("reads an .xlsx buffer and a CSV buffer to the same rows the browser gets", { timeout: 30_000 }, async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sales");
    ws.addRow(["Date", "Net Sales", "VAT"]);
    ws.addRow(["26/09/2026", 1070, 70]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(await readPosBuffer(buf, "wongnai.xlsx")).toEqual([["Date", "Net Sales", "VAT"], ["26/09/2026", 1070, 70]]);
    expect(await readPosBuffer(Buffer.from("Date;Total\n26/09/2026;1,070.00\n", "utf8"), "sales.csv")).toEqual([["Date", "Total"], ["26/09/2026", "1,070.00"]]);
    expect([isPosFileName("a.xlsx"), isPosFileName("a.CSV"), isPosFileName("a.pdf")]).toEqual([true, true, false]);
  });
});
