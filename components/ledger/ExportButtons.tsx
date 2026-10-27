"use client";

import { ChevronDown, Download, FileArchive, FileSpreadsheet, FileText, Loader2, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import { flagsFor } from "@/lib/checks";
import { useCompany } from "@/lib/company-store";
import { buildMonthExport, exportLang, exportOrder } from "@/lib/export";
import { originalPdfPath } from "@/lib/ledger-store";
import { packFileName, packName } from "@/lib/month-pack";
import { saleMonth } from "@/lib/sales";
import { useSales } from "@/lib/sales-store";
import { stockChange } from "@/lib/stock";
import { useStock } from "@/lib/stock-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useChannelLabel } from "@/components/sales/channel-name";
import { useDocName } from "./doc-name";
import type { XlsxLabels } from "@/lib/export-xlsx";
import { monthCosts } from "@/lib/cost-split";
import { fixedForMonth } from "@/lib/fixed-costs";
import { useCostLines } from "@/lib/cash-store";
import { type LedgerEntry, pick, useLedger } from "@/lib/ledger-store";
import { fromSatang } from "@/lib/money";
import { useCategoryLabel } from "@/components/vendors/CategoryIcon";

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
  const catLabel = useCategoryLabel();
  const { lines: fixed } = useCostLines();

  const { sales } = useSales();
  const { counts: stock } = useStock();
  const chName = useChannelLabel();
  const docName = useDocName();
  const [packing, setPacking] = useState<{ done: number; total: number } | null>(null);

  const inputs = () => {
    const data = buildMonthExport(
      entries.map((e) => ({ doc: e.doc, flags: flagsFor(e.doc, { companyTaxId: company.taxId }).filter((f) => f !== "unclear").length })),
      locale,
      company.taxId,
    );
    const c = monthCosts(
      pick(all, "ledger").map((e) => e.doc),
      month,
      company.taxId,
      fixedForMonth(fixed, month),
      stockChange(stock, month).change,
    );
    const costRows = [
      ...[...c.byCategory.entries()].filter(([, v]) => v).map(([k, v]) => ({ label: catLabel(k), amount: fromSatang(v) })),
      ...(c.depreciation ? [{ label: t("pl.depreciation"), amount: fromSatang(c.depreciation) }] : []),
      ...(c.disposal ? [{ label: t("pl.disposal"), amount: fromSatang(c.disposal) }] : []),
      ...(c.stock ? [{ label: t("pl.stock"), amount: fromSatang(c.stock) }] : []),
    ];
    const labels: XlsxLabels = {
      sheetLedger: t("export.sheetLedger"),
      sheetItems: t("export.sheetItems"),
      cols: Object.fromEntries(EXPORT_COLS.map((k) => [k, t(`export.${k}`)])),
      total: t("export.total"),
      yes: t("export.yes"),
      no: t("export.no"),
      docType: (k) => t(`docType.${k as "full"}`),
      category: (k) => catLabel(k),
      sheetCosts: t("export.sheetCosts"),
      cost: t("export.cost"),
      format: company.excelFormat,
    };
    return { data, labels, costs: { rows: costRows, total: fromSatang(c.cost) } };
  };

  const excel = async () => {
    setBusy(true);
    try {
      const { data, labels, costs } = inputs();
      const { downloadMonthXlsx } = await import("@/lib/export-xlsx");
      const file = await downloadMonthXlsx(data, month, exportLang(locale) !== "th", labels, costs);
      toast.success(t("export.done", { file }));
    } catch {
      toast.error(t("app.exportFail"));
    } finally {
      setBusy(false);
    }
  };

  // For the accountant: the Excel (with each row's photo file and the month's sales) and every photo / PDF in one ZIP
  const pack = async () => {
    setBusy(true);
    try {
      const { data, labels, costs } = inputs();
      const rows = [...entries].sort((a, b) => exportOrder(a.doc, b.doc));
      const files = rows.map((e, i) => (e.photoPath ? `documents/${packFileName(i + 1, e.doc, docName(e.doc), "jpg")}` : ""));
      const daySales = sales.filter((s) => saleMonth(s) === month).sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
      const { buildMonthXlsx } = await import("@/lib/export-xlsx");
      const xlsx = await buildMonthXlsx(data, exportLang(locale) !== "th", labels, costs, {
        fileCol: t("export.fileCol"),
        files,
        sales: daySales.length
          ? {
              title: t("export.sheetSales"),
              cols: {
                date: t("export.date"),
                channel: t("export.channel"),
                docs: t("export.saleDocs"),
                bills: t("export.bills"),
                gross: t("export.gross"),
                vat: t("export.vat"),
                net: t("export.saleNet"),
              },
              rows: daySales.map((s) => ({
                date: s.date,
                channel: chName(s.channel),
                docs: s.docFrom ? `${s.docFrom} – ${s.docTo}` : "",
                bills: s.bills,
                gross: s.gross,
                vat: s.vat,
                net: Math.round((s.gross - s.vat) * 100) / 100,
              })),
            }
          : undefined,
      });

      // Photos (and the original PDF, when the document came as one), four at a time
      const bucket = supabaseBrowser().storage.from("documents");
      const out: Record<string, [Uint8Array, { level: 0 | 6 }]> = { [`${labels.sheetLedger}-${month}.xlsx`]: [new Uint8Array(xlsx), { level: 6 }] };
      const jobs = rows.flatMap((e, i) => (e.photoPath ? [{ path: e.photoPath, name: files[i] }] : []));
      setPacking({ done: 0, total: jobs.length });
      let done = 0;
      const get = async (path: string) => {
        const { data: blob } = await bucket.download(path);
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      };
      for (let i = 0; i < jobs.length; i += 4) {
        await Promise.all(
          jobs.slice(i, i + 4).map(async (j) => {
            const [photo, pdf] = await Promise.all([get(j.path), get(originalPdfPath(j.path)).catch(() => null)]);
            if (photo) out[j.name] = [photo, { level: 0 }];
            if (pdf) out[j.name.replace(/\.jpg$/, ".pdf")] = [pdf, { level: 0 }];
            setPacking({ done: ++done, total: jobs.length });
          }),
        );
      }
      const { zipSync } = await import("fflate");
      const { saveFile } = await import("@/lib/export-xlsx");
      const file = packName(month);
      saveFile(new Blob([zipSync(out) as BlobPart], { type: "application/zip" }), file);
      toast.success(t("export.done", { file }));
    } catch {
      toast.error(t("app.exportFail"));
    } finally {
      setBusy(false);
      setPacking(null);
    }
  };

  // One menu instead of four buttons; while a file is being made the button says so
  const working = busy || !!packing;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" className="h-10 rounded-full px-4 pointer-fine:h-9" disabled={working}>
          {working ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {packing ? t("export.packing", { done: packing.done, total: packing.total }) : busy ? t("export.exporting") : t("export.menu")}
          {!working && <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl">
        <DropdownMenuItem disabled={!entries.length} onSelect={() => void excel()} className="gap-2 py-2.5">
          <FileSpreadsheet className="size-4 text-ok" />
          {t("export.excel")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!entries.length} onSelect={() => void pack()} className="items-start gap-2 py-2.5">
          <FileArchive className="mt-0.5 size-4 text-brand" />
          <span className="grid gap-0.5">
            {t("export.pack")}
            <span className="text-[11px] leading-snug text-muted-foreground">{t("export.packShort")}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2 py-2.5">
          <Link href={`/ledger/report/${month}?print=1`}>
            <FileText className="size-4 text-bad" />
            {t("export.pdf")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2 py-2.5">
          <Link href={`/ledger/wht/${month}`}>
            <ReceiptText className="size-4 text-muted-foreground" />
            {t("whtList.short")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
