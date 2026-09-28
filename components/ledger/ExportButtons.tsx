"use client";

import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { flagsFor } from "@/lib/checks";
import { useCompany } from "@/lib/company-store";
import { buildMonthExport, exportLang } from "@/lib/export";
import { monthCosts } from "@/lib/cost-split";
import { type LedgerEntry, pick, useLedger } from "@/lib/ledger-store";
import { fromSatang } from "@/lib/money";
import { CATEGORIES } from "@/lib/types";

export const EXPORT_COLS = [
  "date", "docNo", "vendor", "vendorTh", "taxId", "branch", "docType", "category", "items", "taxable", "exempt",
  "vat", "net", "wht", "paid", "paidDate", "claimable", "flags", "line", "code", "descTh", "desc", "qty", "unit", "price", "amount",
] as const;

/** Excel download + printable PDF report for one month of the ledger (always the whole month, not the filter) */
export function ExportButtons({ month, entries }: { month: string; entries: LedgerEntry[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const company = useCompany();
  const [busy, setBusy] = useState(false);
  // Depreciation needs equipment bought in earlier months too
  const { entries: all } = useLedger();

  const excel = async () => {
    setBusy(true);
    try {
      const data = buildMonthExport(
        entries.map((e) => ({ doc: e.doc, flags: flagsFor(e.doc, { companyTaxId: company.taxId }).filter((f) => f !== "unclear").length })),
        locale,
        company.taxId,
      );
      const { downloadMonthXlsx } = await import("@/lib/export-xlsx");
      const c = monthCosts(
        pick(all, "ledger").map((e) => e.doc),
        month,
        company.taxId,
      );
      const costRows = [
        ...CATEGORIES.filter((k) => c.byCategory.get(k)).map((k) => ({ label: t(`category.${k}`), amount: fromSatang(c.byCategory.get(k)!) })),
        ...(c.depreciation ? [{ label: t("pl.depreciation"), amount: fromSatang(c.depreciation) }] : []),
        ...(c.disposal ? [{ label: t("pl.disposal"), amount: fromSatang(c.disposal) }] : []),
      ];
      const file = await downloadMonthXlsx(data, month, exportLang(locale) !== "th", {
        sheetLedger: t("export.sheetLedger"),
        sheetItems: t("export.sheetItems"),
        cols: Object.fromEntries(EXPORT_COLS.map((k) => [k, t(`export.${k}`)])),
        total: t("export.total"),
        yes: t("export.yes"),
        no: t("export.no"),
        docType: (k) => t(`docType.${k as "full"}`),
        category: (k) => t(`category.${k as "other"}`),
        sheetCosts: t("export.sheetCosts"),
        cost: t("export.cost"),
      }, { rows: costRows, total: fromSatang(c.cost) });
      toast.success(t("export.done", { file }));
    } catch {
      toast.error(t("app.exportFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-1">
      <Button type="button" variant="secondary" className="h-9 rounded-full px-4" onClick={() => void excel()} disabled={busy || !entries.length}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-ok" />}
        {busy ? t("export.exporting") : t("export.excel")}
      </Button>
      <Button asChild variant="secondary" className="h-9 rounded-full px-4">
        <Link href={`/ledger/report/${month}?print=1`}>
          <FileText className="size-4 text-bad" />
          {t("export.pdf")}
        </Link>
      </Button>
      <Button asChild variant="ghost" className="h-9 rounded-full px-3 text-muted-foreground">
        <Link href={`/ledger/wht/${month}`}>{t("whtList.short")}</Link>
      </Button>
    </div>
  );
}
