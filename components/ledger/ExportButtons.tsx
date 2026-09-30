"use client";

import { FileArchive, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { useFixedCosts } from "@/lib/fixed-store";
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
  const { lines: fixed } = useFixedCosts();

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

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 px-1 pb-1">
      <Button type="button" variant="secondary" className="h-9 rounded-full px-4" onClick={() => void excel()} disabled={busy || !entries.length}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4 text-ok" />}
        {busy ? t("export.exporting") : t("export.excel")}
      </Button>
      <Button type="button" variant="secondary" className="h-9 rounded-full px-4" onClick={() => void pack()} disabled={busy || !entries.length} title={t("export.packHint")}>
        {packing ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4 text-brand" />}
        {packing ? t("export.packing", { done: packing.done, total: packing.total }) : t("export.pack")}
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
