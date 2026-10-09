"use client";

// Employees (admins): who is paid, how (monthly / daily), from which branch; social security enrolment; the ID number
// and address the filing lists need (shown masked in the list); other tax allowances or a fixed monthly withholding.

import { Loader2, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useBranchName } from "@/components/layout/branch-switcher";
import { MoneyInput } from "@/components/invoice/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ALL, branchLabel, byId, headOf } from "@/lib/branches";
import { useBranches } from "@/lib/branch-store";
import { baht } from "@/lib/money";
import { expiringDocuments } from "@/lib/attendance";
import { type Employee, maskId } from "@/lib/payroll";
import { todayBangkok } from "@/lib/thai-tax";
import { deleteEmployee, saveEmployee, useBranchEmployees } from "@/lib/payroll-store";
import { taxIdOk } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";
import { useScreenDate } from "@/components/ScreenDate";

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
  documents: [],
  isNew: true,
});

export function EmployeesTab() {
  const t = useTranslations("pay");
  const sd = useScreenDate();
  const names = useBranchName();
  const { branches } = useBranches();
  // The branch chosen at the top: its staff only ("all branches" = everyone, grouped by branch)
  const { employees, loaded, branch } = useBranchEmployees();
  const [draft, setDraft] = useState<(Employee & { isNew?: boolean }) | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [moving, setMoving] = useState(false);
  // Move staff to another branch: their pay from now on is that branch's (pay already saved keeps its branch)
  const move = async (list: Employee[], to: string) => {
    if (!to) return;
    setMoving(true);
    try {
      for (const e of list) if (e.branchId !== to) await saveEmployee({ ...e, branchId: to });
      const b = byId(branches, to);
      toast.success(t("moved", { count: list.length, branch: b ? branchLabel(b, names) : "" }));
      setPicked(new Set());
    } catch {
      toast.error(t("moveFail"));
    } finally {
      setMoving(false);
    }
  };
  const groups = branch === ALL && branches.length > 1 ? branches.map((b) => ({ b, list: employees.filter((e) => e.branchId === b.id) })).filter((g) => g.list.length) : [{ b: null, list: employees }];
  // Work permits, visas … running out within 30 days (or already out)
  const expiring = expiringDocuments(employees, todayBangkok());

  return (
    <div className="grid gap-3">
      {expiring.length > 0 && (
        <ul className="grid gap-1 rounded-2xl bg-warn/10 px-4 py-3 text-sm">
          {expiring.map((x) => (
            <li key={`${x.employee.id}|${x.doc.name}`} className={cn("flex flex-wrap justify-between gap-x-3", x.daysLeft < 0 && "text-bad")}>
              <span className="font-medium">
                {x.employee.name} · {x.doc.name}
              </span>
              <span className="tabular-nums">{x.daysLeft < 0 ? t("expired", { days: -x.daysLeft }) : x.daysLeft === 0 ? t("expiresToday") : t("expiresIn", { days: x.daysLeft })}</span>
            </li>
          ))}
        </ul>
      )}
      {!loaded ? (
        <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : employees.length === 0 && !draft ? (
        <p className="workspace-panel px-5 py-10 text-center text-sm text-muted-foreground">{t("noEmployees")}</p>
      ) : (
        <div className="grid gap-3">
          {/* Several picked: move them together */}
          {branches.length > 1 && picked.size > 0 && (
            <div className="sticky top-20 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
              <span className="font-semibold">{t("pickedN", { count: picked.size })}</span>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-9 rounded-full bg-background px-3 text-sm text-foreground" aria-label={t("moveTo")}>
                <option value="">{t("moveTo")}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {branchLabel(b, names)}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" className="h-9 rounded-full" disabled={!moveTo || moving} onClick={() => void move(employees.filter((e) => picked.has(e.id)), moveTo)}>
                {moving && <Loader2 className="size-4 animate-spin" />}
                {t("moveBtn")}
              </Button>
              <button type="button" className="ml-auto text-xs underline" onClick={() => setPicked(new Set())}>
                {t("cancel")}
              </button>
            </div>
          )}
          {groups.map(({ b: g, list }) => (
        <section key={g?.id ?? "all"} className="grid gap-1.5">
          {g && <h3 className="px-1 text-xs font-semibold text-muted-foreground">{branchLabel(g, names)} · {t("staffN", { count: list.length })}</h3>}
        <ul className="workspace-panel divide-y divide-border/60 p-0">
          {list.map((e) => {
            const left = !!e.endDate;
            return (
              <li key={e.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", left && "opacity-55")}>
                {branches.length > 1 ? (
                  <Checkbox
                    checked={picked.has(e.id)}
                    onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); if (v === true) n.add(e.id); else n.delete(e.id); return n; })}
                    aria-label={e.name}
                    className="size-5 flex-none rounded-md"
                  />
                ) : null}
                <span className="grid size-10 flex-none place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                  <UserRound className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-[15px] font-semibold">
                    {e.name}
                    {e.nickname && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({e.nickname})</span>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[e.position, maskId(e.nationalId), left ? t("left", { date: sd(e.endDate) }) : ""].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="grid flex-none text-right">
                  <span className="text-[15px] font-semibold tabular-nums">{baht(e.rate)}</span>
                  <span className="text-[11px] text-muted-foreground">{t(e.payType === "monthly" ? "perMonth" : "perDay")}</span>
                </span>
                {/* Its branch, changed right here */}
                {branches.length > 1 && (
                  <select
                    value={e.branchId}
                    disabled={moving}
                    onChange={(ev) => void move([e], ev.target.value)}
                    className="h-9 max-w-[9rem] flex-none rounded-full border bg-background px-2.5 text-xs font-medium"
                    aria-label={t("branchOf", { name: e.name })}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {branchLabel(b, names)}
                      </option>
                    ))}
                  </select>
                )}
                <Button type="button" variant="ghost" size="icon" className="size-9 flex-none" aria-label={t("edit")} onClick={() => setDraft({ ...e })}>
                  <Pencil className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
        </section>
          ))}
        </div>
      )}
      {!draft && (
        <Button type="button" variant="secondary" className="h-10 w-fit rounded-full px-4" onClick={() => setDraft(blank(branch !== ALL ? branch : (headOf(branches)?.id ?? "")))}>
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
    if (draft.documents.some((d) => d.name.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(d.expires))) return toast.error(t("documentNeedsDate"));
    setBusy(true);
    try {
      await saveEmployee({ ...draft, documents: draft.documents.filter((d) => d.name.trim() && d.expires) });
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
          <DateInput value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} className="h-10 bg-background" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("end")}</span>
          <DateInput value={draft.endDate} onChange={(e) => set("endDate", e.target.value)} className="h-10 bg-background" />
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

      <div className="grid gap-2 rounded-2xl bg-muted/50 p-3">
        <p className="text-xs font-medium">{t("documents")}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{t("documentsHint")}</p>
        {draft.documents.map((d, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_9.5rem_auto] items-center gap-2">
            <Input value={d.name} maxLength={60} placeholder={t("documentName")} onChange={(e) => set("documents", draft.documents.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-10 bg-background" />
            <DateInput value={d.expires} onChange={(e) => set("documents", draft.documents.map((x, j) => (j === i ? { ...x, expires: e.target.value } : x)))} className="h-10 bg-background" />
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("delete")} onClick={() => set("documents", draft.documents.filter((_, j) => j !== i))}>
              <X className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="ghost" className="h-9 w-fit rounded-full px-3 text-[13px]" onClick={() => set("documents", [...draft.documents, { name: "", expires: "" }])}>
          <Plus className="size-4" />
          {t("addDocument")}
        </Button>
      </div>

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
