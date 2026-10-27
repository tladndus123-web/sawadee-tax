"use client";

// The accountant's Excel layout (owner, 2026-10-27): tick the purchase-ledger columns the accountant wants, put them in
// their order and give them the accountant's own headings. Saved for the company (admins); the app's Excel, the LINE
// Excel and the accountant link all follow it (lib/excel-format).

import { ArrowDown, ArrowUp, FileSpreadsheet, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { saveCompany, useCompany } from "@/lib/company-store";
import { LEDGER_COLS, type LedgerCol } from "@/lib/excel-format";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";
import { useFoldStatus } from "./SettingsFold";

type Row = { key: LedgerCol; on: boolean; label: string };

const fromFormat = (cols: { key: LedgerCol; label: string }[] | null): Row[] => {
  const on = cols ?? LEDGER_COLS.map((key) => ({ key, label: "" }));
  return [...on.map((c) => ({ ...c, on: true })), ...LEDGER_COLS.filter((k) => !on.some((c) => c.key === k)).map((key) => ({ key, on: false, label: "" }))];
};

export function ExcelFormatCard() {
  const t = useTranslations();
  const company = useCompany();
  const isAdmin = useMe().role === "admin";
  const [rows, setRows] = useState<Row[]>(() => fromFormat(company.excelFormat?.cols ?? null));
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows(fromFormat(company.excelFormat?.cols ?? null)), [company.excelFormat]);
  useFoldStatus(company.excelFormat ? t("excelFmt.custom", { n: company.excelFormat.cols.length }) : t("excelFmt.usual"));
  if (!isAdmin) return null;

  const move = (i: number, by: -1 | 1) =>
    setRows((r) => {
      const j = i + by;
      if (j < 0 || j >= r.length) return r;
      const n = [...r];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const save = async (usual = false) => {
    setBusy(true);
    try {
      const cols = rows.filter((r) => r.on).map((r) => ({ key: r.key, label: r.label.trim() }));
      await saveCompany({ excel_format: usual || !cols.length ? null : { cols } });
      toast.success(t("excelFmt.saved"));
    } catch {
      toast.error(t("app.saveFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="excelfmt-title" className="workspace-panel grid gap-3 p-5">
      <h2 id="excelfmt-title" className="flex items-center gap-2 text-lg font-semibold">
        <FileSpreadsheet className="size-5 text-brand" aria-hidden />
        {t("excelFmt.title")}
      </h2>
      <p className="text-[13px] text-muted-foreground">{t("excelFmt.sub")}</p>
      <ul className="grid gap-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl bg-muted/50 py-1.5 pr-1.5 pl-3", !r.on && "opacity-55")}>
            <label className="flex items-center gap-2.5">
              <Checkbox checked={r.on} onCheckedChange={(v) => setRows((x) => x.map((y, k) => (k === i ? { ...y, on: v === true } : y)))} aria-label={t(`export.${r.key}`)} />
              <span className="w-24 truncate text-[13px] font-medium sm:w-32">{t(`export.${r.key}`)}</span>
            </label>
            <Input
              value={r.label}
              maxLength={40}
              disabled={!r.on}
              placeholder={t("excelFmt.namePh")}
              onChange={(e) => setRows((x) => x.map((y, k) => (k === i ? { ...y, label: e.target.value } : y)))}
              className="h-9 min-w-0 text-[13px]"
              aria-label={t("excelFmt.name", { col: t(`export.${r.key}`) })}
            />
            <span className="flex">
              <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("excelFmt.up")}>
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-9 rounded-full" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={t("excelFmt.down")}>
                <ArrowDown className="size-4" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={() => void save(true)}>
          {t("excelFmt.reset")}
        </Button>
        <Button type="button" className="rounded-full px-6" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("excelFmt.save")}
        </Button>
      </div>
    </section>
  );
}
