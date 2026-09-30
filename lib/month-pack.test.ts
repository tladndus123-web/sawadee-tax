import { describe, expect, it } from "vitest";
import { packFileName, packName, safeName } from "./month-pack";

describe("file names in the accountant's month pack", () => {
  it("numbered like the Excel rows, with date, vendor and document number", () => {
    expect(packFileName(3, { date: "2026-09-02", docNo: "IV-123" }, "Makro Srinakarin", "jpg")).toBe("003_2026-09-02_Makro-Srinakarin_IV-123.jpg");
    expect(packFileName(12, { date: "2026-09-02", docNo: "IV-123" }, "Makro Srinakarin", "pdf")).toBe("012_2026-09-02_Makro-Srinakarin_IV-123.pdf");
  });
  it("Thai and Japanese names stay; slashes and reserved characters go", () => {
    expect(safeName("บริษัท แพนฟู้ด จำกัด")).toBe("บริษัท-แพนฟู้ด-จำกัด");
    expect(safeName('A/B:C*D?"E<F>|G')).toBe("A-B-C-D-E-F-G");
    expect(packFileName(1, { date: "2026-09-02", docNo: "IV/2026/001" }, "マクロ", "jpg")).toBe("001_2026-09-02_マクロ_IV-2026-001.jpg");
  });
  it("no document number, no date, no name: still a clear file name", () => {
    expect(packFileName(7, { date: "", docNo: "" }, "", "jpg")).toBe("007_no-date_document.jpg");
  });
  it("long names are cut", () => {
    expect(safeName("x".repeat(100)).length).toBe(40);
    expect(packName("2026-09")).toBe("sawadee-tax-2026-09.zip");
  });
});
