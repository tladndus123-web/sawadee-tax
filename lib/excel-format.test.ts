import { describe, expect, it } from "vitest";
import { LEDGER_COLS, ledgerColumns, readExcelFormat } from "./excel-format";

describe("the accountant's Excel layout", () => {
  it("reads a clean layout, or none", () => {
    expect(readExcelFormat(null)).toBeNull();
    expect(readExcelFormat({ cols: [] })).toBeNull();
    expect(readExcelFormat({ cols: [{ key: "net", label: " ยอดสุทธิ " }, { key: "x" }, { key: "net" }, { key: "date" }] })).toEqual({
      cols: [
        { key: "net", label: "ยอดสุทธิ" },
        { key: "date", label: "" },
      ],
    });
  });
  it("falls back to the usual columns", () => {
    expect(ledgerColumns(null, true).map((c) => c.key)).toEqual([...LEDGER_COLS]);
    expect(ledgerColumns(null, false).some((c) => c.key === "vendorTh")).toBe(false);
    expect(ledgerColumns({ cols: [{ key: "vat", label: "" }] }, false)).toEqual([{ key: "vat", label: "" }]);
  });
});
