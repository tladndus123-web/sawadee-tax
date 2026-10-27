// The accountant's Excel layout (owner, 2026-10-27: "회계사 엑셀 양식 맞추기"): which columns of the purchase-ledger
// sheet, in which order, under which headings. Set once for the company (company_settings.excel_format); the app's
// Excel button, the LINE Excel and the accountant link all follow it. Without one, the usual layout.

/** The ledger sheet's columns, in the usual order (vendorTh = the seller's Thai name, file = the photo's file name) */
export const LEDGER_COLS = ["date", "docNo", "vendor", "vendorTh", "taxId", "branch", "docType", "category", "items", "taxable", "exempt", "vat", "net", "wht", "paid", "paidDate", "claimable", "flags"] as const;
export type LedgerCol = (typeof LEDGER_COLS)[number];
export const MONEY_COLS: ReadonlySet<LedgerCol> = new Set(["taxable", "exempt", "vat", "net", "wht"]);

export interface ExcelFormat {
  /** Shown columns in order; label "" = the usual heading */
  cols: { key: LedgerCol; label: string }[];
}

const isCol = (v: unknown): v is LedgerCol => typeof v === "string" && (LEDGER_COLS as readonly string[]).includes(v);

/** What was stored → a clean layout, or null for "the usual" (nothing stored, or nothing left to show) */
export function readExcelFormat(v: unknown): ExcelFormat | null {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!o || !Array.isArray(o.cols)) return null;
  const seen = new Set<string>();
  const cols: ExcelFormat["cols"] = [];
  for (const c of o.cols) {
    const x = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    if (!isCol(x.key) || seen.has(x.key)) continue;
    seen.add(x.key);
    cols.push({ key: x.key, label: typeof x.label === "string" ? x.label.trim().slice(0, 40) : "" });
  }
  return cols.length ? { cols } : null;
}

/** The ledger sheet's columns for this export: the company's layout, else the usual one (Thai name when asked) */
export function ledgerColumns(format: ExcelFormat | null | undefined, thaiColumn: boolean): { key: LedgerCol; label: string }[] {
  if (format) return format.cols;
  return LEDGER_COLS.filter((k) => thaiColumn || k !== "vendorTh").map((key) => ({ key, label: "" }));
}
