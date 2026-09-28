"use client";

// Import a POS export (.xlsx / .csv): the columns are matched automatically and shown as dropdowns the person can
// change; the preview adds the rows up into one line per day and channel, exactly what will be saved.

import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useScreenDate } from "@/components/ScreenDate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { baht } from "@/lib/money";
import { aggregate, type Cell, type ColumnMap, type Field, findHeader } from "@/lib/pos-import";
import { readPosFile, UnsupportedFile } from "@/lib/pos-read";
import { CHANNELS, type Channel, type Sale } from "@/lib/sales";
import { saveSalesBulk } from "@/lib/sales-store";
import { useBranchName } from "@/components/layout/branch-switcher";
import { ALL, branchLabel, headOf } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";

const FIELDS: Field[] = ["date", "gross", "vat", "preVat", "exempt", "receipt", "bills", "channel"];
const NONE = -1;

export function PosImport({ existing, onClose }: { existing: Sale[]; onClose: () => void }) {
  const t = useTranslations();
  const sd = useScreenDate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Cell[][] | null>(null);
  const [headerAt, setHeaderAt] = useState(0);
  const [map, setMap] = useState<ColumnMap>({});
  const [channel, setChannel] = useState<Channel>("store");
  // The branch the days go to: the one the person works in, else the head office
  const names = useBranchName();
  const { branches } = useBranches();
  const working = useBranch();
  const [branch, setBranch] = useState(() => (working !== ALL ? working : (headOf(branches)?.id ?? "")));
  const [busy, setBusy] = useState<"read" | "save" | null>(null);

  const open = async (file: File) => {
    setBusy("read");
    try {
      const all = await readPosFile(file);
      const found = findHeader(all);
      setName(file.name);
      setRows(all);
      setHeaderAt(found?.index ?? 0);
      setMap(found?.map ?? {});
      if (!found) toast.info(t("pos.noHeader"));
    } catch (e) {
      toast.error(e instanceof UnsupportedFile ? t("pos.xls") : t("pos.readFail"));
    } finally {
      setBusy(null);
    }
  };

  const headers = rows?.[headerAt] ?? [];
  const result = useMemo(
    () => (rows && map.date !== undefined && map.gross !== undefined ? aggregate(rows.slice(headerAt + 1), map, channel) : null),
    [rows, headerAt, map, channel],
  );
  const days = result?.days ?? [];
  const replacing = days.filter((d) => existing.some((x) => x.date === d.date && x.channel === d.channel)).length;
  const total = days.reduce((a, d) => a + d.gross, 0);
  const dayCount = new Set(days.map((d) => d.date)).size;

  const save = async () => {
    setBusy("save");
    try {
      const { saved, locked, invalid } = await saveSalesBulk(days, branch);
      toast.success(t("pos.saved", { count: saved }));
      if (locked) toast.warning(t("pos.locked", { count: locked }));
      if (invalid) toast.warning(t("pos.invalid", { count: invalid }));
      onClose();
    } catch {
      toast.error(t("app.saveFail"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-3xl" data-lenis-prevent>
        <DialogHeader>
          <DialogTitle>{t("pos.title")}</DialogTitle>
          <DialogDescription>{t("pos.hint")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant={rows ? "secondary" : "default"} className="h-11 rounded-full px-5" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {busy === "read" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
              {rows ? t("pos.other") : t("pos.pick")}
            </Button>
            {name && <span className="truncate text-muted-foreground">{name}</span>}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void open(f);
              }}
            />
          </div>

          {rows && (
            <>
              <div className="grid gap-2 rounded-2xl bg-muted/50 p-3">
                <p className="text-xs font-semibold text-muted-foreground">{t("pos.columns")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <label key={f} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
                      <span className="text-xs">
                        {t(`pos.f.${f}`)}
                        {(f === "date" || f === "gross") && <span className="text-bad"> *</span>}
                      </span>
                      <select
                        className="h-9 min-w-0 rounded-lg border bg-background px-2 text-xs"
                        value={map[f] ?? NONE}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setMap((m) => {
                            const next = { ...m };
                            if (v === NONE) delete next[f];
                            else next[f] = v;
                            return next;
                          });
                        }}
                      >
                        <option value={NONE}>{t("pos.none")}</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {String(h ?? "").trim() || `#${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {branches.length > 1 && (
                    <label className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
                      <span className="text-xs">{t("branch.label")}</span>
                      <select className="h-9 rounded-lg border bg-background px-2 text-xs" value={branch} onChange={(e) => setBranch(e.target.value)}>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {branchLabel(b, names)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
                    <span className="text-xs">{t("pos.defaultChannel")}</span>
                    <select className="h-9 rounded-lg border bg-background px-2 text-xs" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                      {CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {t(`sales.ch.${c}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
                    <span className="text-xs">{t("pos.headerRow")}</span>
                    <select className="h-9 rounded-lg border bg-background px-2 text-xs" value={headerAt} onChange={(e) => setHeaderAt(Number(e.target.value))}>
                      {rows.slice(0, 15).map((r, i) => (
                        <option key={i} value={i}>
                          {i + 1}: {r.filter((c) => String(c ?? "").trim()).slice(0, 3).join(" · ").slice(0, 40)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {days.length === 0 ? (
                <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-xs">
                  <AlertTriangle className="mt-0.5 size-3.5 flex-none text-warn" aria-hidden />
                  {t("pos.nothing")}
                </p>
              ) : (
                <>
                  <p className="font-semibold">
                    {t("pos.preview", { days: dayCount, lines: days.length, total: baht(total) })}
                    {result?.skipped ? <span className="font-normal text-muted-foreground"> · {t("pos.skipped", { count: result.skipped })}</span> : null}
                  </p>
                  {replacing > 0 && <p className="text-xs text-brand">{t("pos.replacing", { count: replacing })}</p>}
                  {days.some((d) => d.vatComputed) && <p className="text-xs text-muted-foreground">{t("pos.vatComputed")}</p>}
                  <div className="max-h-72 overflow-auto rounded-xl border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="px-2 py-1.5 text-left">{t("sales.date")}</th>
                          <th className="px-2 py-1.5 text-left">{t("sales.channel")}</th>
                          <th className="px-2 py-1.5 text-right">{t("sales.bills")}</th>
                          <th className="px-2 py-1.5 text-right">{t("sales.gross")}</th>
                          <th className="px-2 py-1.5 text-right">{t("sales.vat")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((d) => (
                          <tr key={`${d.date}-${d.channel}`} className="border-t">
                            <td className="px-2 py-1.5 whitespace-nowrap">{sd(d.date)}</td>
                            <td className="px-2 py-1.5">{t(`sales.ch.${d.channel}`)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{d.bills}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{baht(d.gross)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{baht(d.vat)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-11 rounded-full px-6" disabled={!days.length || !!busy} onClick={() => void save()}>
                  {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  {t("pos.import", { lines: days.length })}
                </Button>
                <Button type="button" variant="ghost" className="h-11 rounded-full px-4" disabled={!!busy} onClick={onClose}>
                  {t("app.close")}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
