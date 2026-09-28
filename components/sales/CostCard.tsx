"use client";

// Food cost, labour and rent against sales for the month (owner's feedback 2026-09-28): each share with its target,
// and the three together. Labour has no receipts: admins type it in per branch and month (Thai payroll lines).
// Admins can change the targets too.

import { ChefHat, Loader2, Pencil, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useBranchName } from "@/components/layout/branch-switcher";
import { MoneyInput } from "@/components/invoice/fields";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ALL, branchLabel, headOf } from "@/lib/branches";
import { useBranch, useBranches } from "@/lib/branch-store";
import { useCategories } from "@/lib/category-store";
import { saveCompany, useCompany } from "@/lib/company-store";
import { type CostLine, costControl, type LaborLine, monthLabor, targetsOf } from "@/lib/cost-control";
import { monthCosts } from "@/lib/cost-split";
import { useLabor, saveLabor } from "@/lib/labor-store";
import { isMonthLocked } from "@/lib/month-lock-store";
import { baht, fromSatang } from "@/lib/money";
import { useMe } from "@/lib/role-store";
import type { LedgerDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE = { ok: "text-ok", near: "text-warn", over: "text-bad", none: "text-muted-foreground" } as const;
const BAR = { ok: "bg-ok", near: "bg-warn", over: "bg-bad", none: "bg-muted-foreground/30" } as const;

export function CostCard({ month, salesValue, purchases }: { month: string; salesValue: number; purchases: LedgerDoc[] }) {
  const t = useTranslations("cost");
  const company = useCompany();
  const isAdmin = useMe().role === "admin";
  const { rows: categories } = useCategories();
  const { lines } = useLabor();
  const [laborOpen, setLaborOpen] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const targets = targetsOf(company.costTargets);
  const foodKeys = useMemo(() => new Set(categories.filter((c) => c.foodCost).map((c) => c.key as string)), [categories]);
  const c = useMemo(
    () => costControl(Math.round(salesValue * 100), monthCosts(purchases, month, company.taxId), foodKeys, monthLabor(lines, month), targets),
    [salesValue, purchases, month, company.taxId, foodKeys, lines, targets],
  );

  return (
    <section className="workspace-panel grid gap-4 p-5 sm:p-6" aria-labelledby="cost-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 id="cost-title" className="flex items-center gap-2 text-sm font-semibold">
            <ChefHat className="size-4 text-brand" aria-hidden />
            {t("title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            <Button type="button" variant="outline" className="h-9 rounded-full px-3 text-[13px]" onClick={() => setLaborOpen(true)}>
              <Users className="size-4" />
              {t("enterLabor")}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("targets")} onClick={() => setTargetsOpen(true)}>
              <Pencil className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-2.5">
        <Ratio label={t("food")} line={c.food} />
        <Ratio label={t("labor")} line={c.labor} empty={!monthLabor(lines, month) ? t("noLabor") : undefined} />
        <Ratio label={t("rent")} line={c.rent} />
        <div className="border-t pt-2.5">
          <Ratio label={t("prime")} line={c.prime} strong />
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("note")}</p>

      <Dialog open={laborOpen} onOpenChange={setLaborOpen}>{laborOpen && <LaborSheet month={month} onDone={() => setLaborOpen(false)} />}</Dialog>
      <Dialog open={targetsOpen} onOpenChange={setTargetsOpen}>{targetsOpen && <TargetsSheet onDone={() => setTargetsOpen(false)} />}</Dialog>
    </section>
  );
}

function Ratio({ label, line, strong, empty }: { label: string; line: CostLine; strong?: boolean; empty?: string }) {
  const t = useTranslations("cost");
  const width = line.pct === null ? 0 : Math.min(100, (line.pct / Math.max(line.target * 1.5, 1)) * 100);
  const mark = Math.min(100, (line.target / Math.max(line.target * 1.5, 1)) * 100);
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("text-sm", strong && "font-semibold")}>{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{baht(fromSatang(line.amount))}</span>
          <span className={cn("min-w-[3.5rem] text-right text-[15px] font-semibold tabular-nums", TONE[line.level])}>{line.pct === null ? "–" : `${line.pct}%`}</span>
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", BAR[line.level])} style={{ width: `${width}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-foreground/40" style={{ left: `${mark}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground">
        {empty ?? t("target", { pct: line.target })}
        {line.level === "over" && ` · ${t("over")}`}
        {line.level === "near" && ` · ${t("near")}`}
      </span>
    </div>
  );
}

/** Labour for a branch and month: wages, the employer's social security share, other staff costs */
function LaborSheet({ month, onDone }: { month: string; onDone: () => void }) {
  const t = useTranslations("cost");
  const names = useBranchName();
  const { branches } = useBranches();
  const working = useBranch();
  const { lines } = useLabor({ all: true });
  const [branchId, setBranchId] = useState(() => (working !== ALL ? working : (headOf(branches)?.id ?? "")));
  const current = lines.find((l) => l.month === month && l.branchId === branchId);
  const [draft, setDraft] = useState<LaborLine>(() => current ?? { branchId, month, wages: 0, socialSecurity: 0, other: 0, note: "" });
  const [busy, setBusy] = useState(false);
  const pick = (id: string) => {
    setBranchId(id);
    setDraft(lines.find((l) => l.month === month && l.branchId === id) ?? { branchId: id, month, wages: 0, socialSecurity: 0, other: 0, note: "" });
  };
  const total = (draft.wages || 0) + (draft.socialSecurity || 0) + (draft.other || 0);

  const save = async () => {
    setBusy(true);
    try {
      await saveLabor({ ...draft, branchId, month });
      toast.success(t("laborSaved"));
      onDone();
    } catch (e) {
      toast.error(isMonthLocked(e) ? t("locked") : t("fail"));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: "wages" | "socialSecurity" | "other", label: string, hint: string) => (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      <MoneyInput className="h-11 text-[15px]" value={draft[key]} onChange={(v) => setDraft({ ...draft, [key]: Number(v) || 0 })} />
      <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
    </label>
  );

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t("laborTitle", { month })}</DialogTitle>
        <DialogDescription className="text-xs">{t("laborHint")}</DialogDescription>
        <Link href="/payroll" className="w-fit text-xs font-medium text-primary hover:underline">
          {t("fromPayroll")} →
        </Link>
      </DialogHeader>
      {branches.length > 1 && (
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("branch")}</span>
          <select value={branchId} onChange={(e) => pick(e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm">
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {branchLabel(b, names)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-4">
        {field("wages", t("wages"), t("wagesHint"))}
        {field("socialSecurity", t("social"), t("socialHint"))}
        {field("other", t("otherLabor"), t("otherHint"))}
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("memo")}</span>
          <Input value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="h-10" />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-sm">
          {t("total")} <b className="tabular-nums">{baht(total)}</b>
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onDone}>
            {t("cancel")}
          </Button>
          <Button type="button" className="rounded-full" disabled={busy} onClick={() => void save()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function TargetsSheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("cost");
  const company = useCompany();
  const now = targetsOf(company.costTargets);
  const [v, setV] = useState({ food: String(now.food), labor: String(now.labor), rent: String(now.rent) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const out = { food: Number(v.food), labor: Number(v.labor), rent: Number(v.rent) };
    if (Object.values(out).some((n) => !Number.isFinite(n) || n <= 0 || n > 100)) return toast.error(t("badTarget"));
    setBusy(true);
    try {
      await saveCompany({ cost_targets: out });
      toast.success(t("targetsSaved"));
      onDone();
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogContent className="rounded-3xl sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{t("targets")}</DialogTitle>
        <DialogDescription className="text-xs">{t("targetsHint")}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-2">
        {(["food", "labor", "rent"] as const).map((k) => (
          <label key={k} className="grid gap-1">
            <span className="text-xs text-muted-foreground">{t(k)}</span>
            <span className="flex items-center gap-1">
              <Input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, "") })} className="h-10 text-right tabular-nums" />
              <span className="text-sm text-muted-foreground">%</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="button" className="rounded-full" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </DialogContent>
  );
}
