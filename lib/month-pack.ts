// "회계사용 한 달 자료": one ZIP per month for the accountant — the Excel ledger (purchases, items, costs, sales)
// and every document's photo (and original PDF), named so they sort like the ledger and are easy to match.

/** Something safe as a file name on Windows, macOS and phones: no slashes or reserved characters, short */
export function safeName(s: string, max = 40): string {
  return s
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, max)
    .replace(/[-.]+$/g, "");
}

/** 003_2026-09-02_Makro-Srinakarin_IV-123.jpg — number = row in the Excel sheet (1-based) */
export function packFileName(index: number, doc: { date: string; docNo: string }, vendor: string, ext: "jpg" | "pdf"): string {
  const parts = [String(index).padStart(3, "0"), doc.date || "no-date", safeName(vendor) || "document", safeName(doc.docNo, 24)].filter(Boolean);
  return `${parts.join("_")}.${ext}`;
}

/** The ZIP's own name */
export const packName = (month: string) => `sawadee-tax-${month}.zip`;
