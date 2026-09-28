"use client";

// Employees (admins): who is paid, how (monthly / daily), from which branch; social security enrolment; the ID number
// and address the filing lists need (shown masked in the list); other tax allowances or a fixed monthly withholding.

import { Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useBranchName } from "@/components/layout/branch-switcher";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { branchLabel, byId, headOf } from "@/lib/branches";
import { useBranches } from "@/lib/branch-store";
import { baht } from "@/lib/money";
import { type Employee, maskId } from "@/lib/payroll";
import { deleteEmployee, saveEmployee, useEmployees } from "@/lib/payroll-store";
import { taxIdOk } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";

const blank = (branchId: string): Employee & { isNew: boolean } => ({
  id: "",
  branchId,
  name: "",
  nickname: "",
  position: "",
  payType: "monthly",
  rate: 0,
  startDate: "",
  endDate: "",
  ssEnrolled: true,
  nationalId: "",
  address: "",
  extraAllowance: 0,
  whtFixed: null,
  note: "",
  isNew: true,
});

export function EmployeesTab() {
  const t = useTranslations("pay");
  const names = useBranchName();
  const { branches } = useBranches();
  const { employees, loaded } = useEmployees();
  const [draft, setDraft] = useState<(Employee & { isNew?: boolean }) | null>(null);

  return (
    <div className="grid gap-3">
      {!loaded ? (
        <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : employees.length === 0 && !draft ? (
        <p className="workspace-panel px-5 py-10 text-center text-sm text-muted-foreground">{t("noEmployees")}</p>
      ) : (
        <ul className="workspace-panel divide-y divide-border/60 p-0">
          {employees.map((e) => {
            const b = byId(branches, e.branchId);
            const left = !!e.endDate;
            return (
              <li key={e.id} className={cn("flex items-center gap-3 px-4 py-3", left && "opacity-55")}>
                <span className="grid size-10 flex-none place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                  <UserRound className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-[15px] font-semibold">
                    {e.name}
                    {e.nickname && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({e.nickname})</span>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[b && branches.length > 1 ? branchLabel(b, names) : "", e.position, maskId(e.nationalId), left ? t("left", { date: e.endDate }) : ""].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="grid flex-none text-right">
                  <span className="text-[15px] font-semibold tabular-nums">{baht(e.rate)}</span>
                  <span className="text-[11px] text-muted-foreground">{t(e.payType === "monthly" ? "perMonth" : "perDay")}</span>
                </span>
                <Button type="button" variant="ghost" size="icon" className="size-9 flex-none" aria-label={t("edit")} onClick={() => setDraft({ ...e })}>
                  <Pencil className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {!draft && (
        <Button type="button" variant="secondary" className="h-10 w-fit rounded-full px-4" onClick={() => setDraft(blank(headOf(branches)?.id ?? ""))}>
          <Plus className="size-4" />
          {t("addEmployee")}
        </Button>
      )}
      {draft && <EmployeeForm draft={draft} onChange={setDraft} onDone={() => setDraft(null)} />}
    </div>
  );
}

function EmployeeForm({ draft, onChange, onDone }: { draft: Employee & { isNew?: boolean }; onChange: (d: Employee & { isNew?: boolean }) => void; onDone: () => void }) {
  const t = useTranslations("pay");
  const names = useBranchName();
  const { branches } = useBranches();
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => onChange({ ...draft, [k]: v });
  const idBad = draft.nationalId.length > 0 && !taxIdOk(draft.nationalId);

  const save = async () => {
    if (!draft.name.trim()) return toast.error(t("needName"));
    if (idBad) return toast.error(t("badId"));
    setBusy(true);
    try {
      await saveEmployee(draft);
      toast.success(t("employeeSaved"));
      onDone();
    } catch {
      toast.error(t("fail"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(t("deleteAsk", { name: draft.name }))) return;
    setBusy(true);
    try {
      await deleteEmployee(draft.id);
      toast.success(t("employeeDeleted"));
      onDone();
    } catch {
      toast.error(t("employeeInUse"));
    } finally {
      setBusy(false);
    }
  };

  const text = (k: "name" | "nickname" | "position" | "address" | "note", label: string, max: number) => (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input value={draft[k]} maxLength={max} onChange={(e) => set(k, e.target.value)} className="h-10 bg-background" />
    </label>
  );

  return (
    <form
      className="workspace-panel grid gap-4 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm font-semibold">{draft.isNew ? t("newEmployee") : t("editEmployee")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {text("name", t("name"), 120)}
        {text("nickname", t("nickname"), 40)}
        {text("position", t("position"), 60)}
        {branches.length > 1 && (
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">{t("branch")}</span>
            <select value={draft.branchId} onChange={(e) => set("branchId", e.target.value)} className="h-10 rounded-xl border bg-background px-3 text-sm">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {branchLabel(b, names)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-2">
        <span className="text-xs text-muted-foreground">{t("payType")}</span>
        <div className="flex gap-2">
          {(["monthly", "daily"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={draft.payType === p}
              onClick={() => set("payType", p)}
              className={cn("press h-9 rounded-full px-4 text-[13px] font-medium ring-1 ring-foreground/10", draft.payType === p ? "bg-primary text-primary-foreground ring-primary" : "bg-background")}
            >
              {t(p)}
            </button>
          ))}
        </div>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{draft.payType === "monthly" ? t("salary") : t("dayRate")}</span>
          <MoneyInput className="h-10 bg-background text-[15px] font-semibold" value={draft.rate} onChange={(v) => set("rate", Number(v) || 0)} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("start")}</span>
          <Input type="date" value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} className="h-10 bg-background" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("end")}</span>
          <Input type="date" value={draft.endDate} onChange={(e) => set("endDate", e.target.value)} className="h-10 bg-background" />
        </label>
      </div>

      <label className="flex items-center gap-3">
        <Switch checked={draft.ssEnrolled} onCheckedChange={(v) => set("ssEnrolled", v)} />
        <span className="text-sm">{t("ssEnrolled")}</span>
      </label>

      <div className="grid gap-3 rounded-2xl bg-muted/50 p-3">
        <p className="text-xs leading-snug text-muted-foreground">{t("privateHint")}</p>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("nationalId")}</span>
          <Input
            value={draft.nationalId}
            inputMode="numeric"
            maxLength={13}
            onChange={(e) => set("nationalId", e.target.value.replace(/\D/g, ""))}
            className={cn("mono h-10 bg-background", idBad && "border-bad")}
          />
        </label>
        {text("address", t("address"), 300)}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("extraAllowance")}</span>
          <MoneyInput className="h-10 bg-background" value={draft.extraAllowance} onChange={(v) => set("extraAllowance", Number(v) || 0)} />
          <span className="text-[11px] leading-snug text-muted-foreground">{t("extraAllowanceHint")}</span>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("whtFixed")}</span>
          <Input
            inputMode="decimal"
            value={draft.whtFixed === null ? "" : String(draft.whtFixed)}
            placeholder={t("whtAuto")}
            onChange={(e) => set("whtFixed", e.target.value.trim() === "" ? null : Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
            className="h-10 bg-background text-right tabular-nums"
          />
          <span className="text-[11px] leading-snug text-muted-foreground">{t("whtFixedHint")}</span>
        </label>
      </div>
      {text("note", t("note"), 300)}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!draft.isNew ? (
          <Button type="button" variant="ghost" className="rounded-full text-muted-foreground hover:text-bad" disabled={busy} onClick={() => void remove()}>
            <Trash2 className="size-4" />
            {t("delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onDone}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="rounded-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
