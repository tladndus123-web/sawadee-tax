"use client";

// 폐기 기록 (owner 2026-11-18, a restaurant extra — Settings → 음식점 기능): record what was thrown away (item, quantity,
// value, reason, photo) and see the month — the total, against last month, the items and reasons that cost the most.
// Everyone who sees the branch records; the person who recorded a line or an admin changes it (the database decides).
// LINE: "폐기" → waste mode (lib/waste-line). Pure parts: lib/waste.

import { Camera, ChevronLeft, ChevronRight, ImageIcon, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useBranchName } from "@/components/layout/branch-switcher";
import { useScreenDate } from "@/components/ScreenDate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/ui/stat";
import { Link } from "@/i18n/navigation";
import { ALL, branchLabel } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { useFoodFeatures } from "@/lib/food-features-store";
import { baht, fromSatang } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import { todayBangkok } from "@/lib/thai-tax";
import { preparePhoto } from "@/lib/upload-queue";
import { cn } from "@/lib/utils";
import { WASTE_REASONS, type WasteLog, wasteMonth, type WasteReason } from "@/lib/waste";
import { removeWaste, saveWaste, useWaste, wastePhotoUrl } from "@/lib/waste-store";

const shift = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export function WastePage() {
  const t = useTranslations("waste");
  const sd = useScreenDate();
  const me = useMe();
  const food = useFoodFeatures();
  const { logs, loaded } = useWaste();
  const today = todayBangkok();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<WasteLog | "new" | null>(null);
  const m = useMemo(() => wasteMonth(logs, month), [logs, month]);
  const days = useMemo(() => {
    const mine = logs.filter((l) => l.day.slice(0, 7) === month);
    const by = new Map<string, WasteLog[]>();
    for (const l of mine) by.set(l.day, [...(by.get(l.day) ?? []), l]);
    return [...by].sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs, month]);
  // "+ 새로 만들기" or the LINE card can open the form at once
  const wantsNew = useSearchParams().get("new") === "1";
  useEffect(() => {
    if (!wantsNew) return;
    setEditing("new");
    // Take ?new=1 off the address so a reload does not open the form again (and "+ 새로 만들기" works on this page too)
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url);
  }, [wantsNew]);

  if (food.loaded && !food.waste)
    return (
      <div className="workspace-panel mx-auto grid max-w-xl gap-3 p-6 text-center">
        <p className="text-[15px] font-semibold">{t("offTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("offHint")}</p>
        <Link href="/settings" className="press mx-auto inline-flex h-11 items-center rounded-full bg-primary px-5 text-[14px] font-semibold text-primary-foreground pointer-fine:h-9">
          {t("toSettings")}
        </Link>
      </div>
    );
  if (!loaded || !food.loaded) return <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" aria-label={t("loading")} />;

  const top = m.items.slice(0, 5);
  const maxItem = Math.max(...top.map((i) => i.amount), 1);
  const canChange = (l: WasteLog) => me.role === "admin" || l.createdBy === me.userId;

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-[var(--shadow-soft)] ring-1 ring-border">
            <button type="button" onClick={() => setMonth(shift(month, -1))} aria-label={t("prev")} className="press grid size-11 place-items-center rounded-full hover:bg-muted pointer-fine:size-9">
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="min-w-24 text-center text-[15px] font-semibold tabular-nums">{month.replace("-", ".")}</span>
            <button type="button" onClick={() => setMonth(shift(month, 1))} disabled={month >= today.slice(0, 7)} aria-label={t("next")} className="press grid size-11 place-items-center rounded-full hover:bg-muted disabled:opacity-30 pointer-fine:size-9">
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <Button type="button" className="h-11 rounded-full px-5" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            {t("add")}
          </Button>
        </div>
      </header>

      <section className="workspace-panel grid gap-4 p-5 sm:p-6" aria-label={t("summary")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label={t("total")} value={baht(fromSatang(m.total))} tone={m.total > 0 ? "bad" : "muted"} hint={m.unpriced ? t("unpriced", { count: m.unpriced }) : undefined} />
          <Stat label={t("vsLast")} value={m.change === null ? "–" : `${m.change > 0 ? "+" : ""}${m.change}%`} tone={m.change === null ? "muted" : m.change > 0 ? "bad" : "ok"} hint={t("lastMonth", { amount: baht(fromSatang(m.before)) })} />
          <Stat label={t("lines")} value={String(m.lines)} hint={m.reasons[0] ? t("topReason", { reason: t(`reason.${m.reasons[0].reason}`) }) : undefined} className="max-sm:col-span-2" />
        </div>
        {top.length > 0 && (
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">{t("topItems")}</h2>
            <ul className="grid gap-1.5">
              {top.map((i) => (
                <li key={i.item} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-[13.5px] max-sm:grid-cols-[minmax(0,6rem)_1fr_auto]">
                  <span className="truncate font-medium">{i.item}</span>
                  <span className="h-2 rounded-full bg-muted">
                    <span className="block h-2 rounded-full bg-bad/70" style={{ width: `${Math.max(4, Math.round((i.amount / maxItem) * 100))}%` }} />
                  </span>
                  <span className="tabular-nums">{baht(fromSatang(i.amount))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {days.length === 0 ? (
        <p className="workspace-panel p-6 text-center text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid gap-3">
          {days.map(([day, list]) => (
            <li key={day} className="workspace-panel grid gap-1 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-muted-foreground tabular-nums">{sd(day)}</h2>
              <ul className="grid divide-y divide-border">
                {list.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <WasteThumb path={l.photoPath} />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-[14.5px] font-medium">
                        {l.item} <span className="text-muted-foreground tabular-nums">· {l.qty} {l.unit}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge tone="warn">{t(`reason.${l.reason}`)}</Badge>
                        {l.source === "line" && <Badge tone="ok">LINE</Badge>}
                        {l.note && <span className="truncate">{l.note}</span>}
                      </span>
                    </span>
                    <span className="flex-none text-[14px] font-semibold tabular-nums">{l.amount === null ? "–" : baht(l.amount)}</span>
                    {canChange(l) && (
                      <button type="button" onClick={() => setEditing(l)} aria-label={t("edit")} className="press grid size-11 flex-none place-items-center rounded-full hover:bg-muted pointer-fine:size-9">
                        <Pencil className="size-4 text-muted-foreground" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {editing && <WasteDialog log={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function WasteThumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (path) void wastePhotoUrl(path).then(setUrl);
  }, [path]);
  if (!path) return <span className="grid size-11 flex-none place-items-center rounded-xl bg-muted text-muted-foreground" aria-hidden><ImageIcon className="size-4" /></span>;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="size-11 flex-none overflow-hidden rounded-xl ring-1 ring-border">
      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed address of a private photo */}
      <img src={url} alt="" className="size-full object-cover" />
    </a>
  ) : (
    <span className="size-11 flex-none animate-pulse rounded-xl bg-muted" aria-hidden />
  );
}

function WasteDialog({ log, onClose }: { log: WasteLog | null; onClose: () => void }) {
  const t = useTranslations("waste");
  const names = useBranchName();
  const { branches } = useBranches();
  const working = useBranch();
  const [day, setDay] = useState(log?.day ?? todayBangkok());
  const [item, setItem] = useState(log?.item ?? "");
  const [qty, setQty] = useState(log ? String(log.qty) : "1");
  const [unit, setUnit] = useState(log?.unit ?? "");
  const [amount, setAmount] = useState(log?.amount === null || log?.amount === undefined ? "" : String(log.amount));
  const [reason, setReason] = useState<WasteReason>(log?.reason ?? "spoiled");
  const [note, setNote] = useState(log?.note ?? "");
  const [branchId, setBranchId] = useState(log?.branchId ?? (working !== ALL ? working : (branches[0]?.id ?? "")));
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const q = Number(qty.replace(/,/g, ""));
  const a = amount.trim() === "" ? null : Number(amount.replace(/,/g, ""));
  const ok = item.trim().length > 0 && q > 0 && (a === null || a >= 0) && !!day;

  const save = async () => {
    setBusy(true);
    try {
      await saveWaste({ id: log?.id, branchId: branchId || undefined, day, item, qty: q, unit, amount: a, reason, note, photo, photoPath: log?.photoPath });
      toast.success(t("saved"));
      onClose();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!log || !confirm(t("removeAsk"))) return;
    setBusy(true);
    try {
      await removeWaste(log);
      toast.success(t("removed"));
      onClose();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{log ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {branches.length > 1 && (
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{t("branch")}</span>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-11 rounded-xl border bg-card px-3 text-[16px]">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {branchLabel(b, names)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{t("item")}</span>
            <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder={t("itemHint")} maxLength={80} />
          </label>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{t("qty")}</span>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">{t("unit")}</span>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" maxLength={20} />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{t("amount")}</span>
            <Input inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("amountHint")} />
          </label>
          <div className="grid gap-1 text-sm" role="group" aria-label={t("reasonLabel")}>
            <span className="text-muted-foreground">{t("reasonLabel")}</span>
            <div className="flex flex-wrap gap-1.5">
              {WASTE_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  aria-pressed={reason === r}
                  className={cn("press h-11 rounded-full px-3.5 text-[13.5px] ring-1 ring-border pointer-fine:h-9", reason === r ? "bg-primary font-semibold text-primary-foreground ring-primary" : "bg-card")}
                >
                  {t(`reason.${r}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{t("day")}</span>
            <DateInput value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{t("note")}</span>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </label>
          <label className="press flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-muted text-[14px] font-medium">
            <Camera className="size-4" aria-hidden />
            {photo ? t("photoReady") : log?.photoPath ? t("photoChange") : t("photo")}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(await preparePhoto(f));
              }}
            />
          </label>
          {photo && (
            <button type="button" onClick={() => setPhoto(null)} className="mx-auto flex items-center gap-1 text-xs text-muted-foreground">
              <X className="size-3" aria-hidden /> {t("photoDrop")}
            </button>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {log ? (
            <Button type="button" variant="ghost" className="h-11 text-bad" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="size-4" aria-hidden />
              {t("remove")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" className="h-11 rounded-full px-6" disabled={!ok || busy} onClick={() => void save()}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
