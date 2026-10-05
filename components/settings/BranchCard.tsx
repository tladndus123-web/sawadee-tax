"use client";

// Admins: the company's branches (สาขา) — number as on tax invoices, and a name. The head office is always there.

import { Loader2, Lock, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BranchAvatar, useBranchName } from "@/components/layout/branch-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/invoice/fields";
import { BRANCH_COLORS, type Branch, branchLabel, COLOR_NAMES, colorOf, isHead } from "@/lib/branches";
import { deleteBranch, saveBranch, useBranches } from "@/lib/branch-store";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";
import { setBranchPin, useBranchPins } from "@/lib/branch-lock";
import { useFoldStatus } from "./SettingsFold";

export function BranchCard() {
  const t = useTranslations("branch");
  const names = useBranchName();
  const isAdmin = useMe().role === "admin";
  const { branches, loaded } = useBranches();
  const { pins } = useBranchPins();
  const tf = useTranslations("fold");
  useFoldStatus(loaded ? tf("branches", { count: branches.length }) : null);
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const [busy, setBusy] = useState(false);
  const locale = useLocale();
  // Sunday … Saturday (2026-09-06 is a Sunday)
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2026, 8, 6 + i))));
  }, [locale]);

  const save = async () => {
    if (!editing) return;
    const no = (editing.no ?? "").replace(/\D/g, "").padStart(5, "0").slice(-5);
    if (!/^\d{5}$/.test(no)) return toast.error(t("badNo"));
    setBusy(true);
    try {
      await saveBranch({ id: editing.id, no, name: editing.name ?? "", sort: editing.sort ?? branches.length, color: editing.color ?? "", closedDays: editing.closedDays ?? [], salesTarget: editing.salesTarget ?? 0 });
      toast.success(t("saved"));
      setEditing(null);
    } catch (e) {
      toast.error(/23505|duplicate/i.test(String((e as { message?: string })?.message ?? e)) ? t("dupNo") : t("fail"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (b: Branch) => {
    if (!confirm(t("deleteAsk", { name: branchLabel(b, names) }))) return;
    setBusy(true);
    try {
      await deleteBranch(b.id);
      toast.success(t("deleted"));
    } catch {
      toast.error(t("inUse"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="branch-title" className="workspace-panel hover-lift [--lift:1.006] grid content-start gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 id="branch-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Store className="size-5 text-brand" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{isAdmin ? t("hint") : t("hintStaff")}</p>
      </div>
      {!loaded ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <ul className="grid divide-y divide-border/60">
          {branches.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-2.5">
              <BranchAvatar branch={b} branches={branches} size="size-8" className="text-sm" />
              <span className="mono w-12 flex-none text-xs text-muted-foreground">{b.no}</span>
              <span className="grid min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[15px] font-medium">{branchLabel(b, names)}</span>
                  {pins.has(b.id) && <Lock className="size-3.5 flex-none text-muted-foreground" aria-label={t("pinSet")} />}
                </span>
                {!!b.closedDays?.length && (
                  <span className="text-xs text-muted-foreground">{t("closedShort", { days: b.closedDays.map((d) => weekdays[d]).join(" · ") })}</span>
                )}
              </span>
              {isAdmin && (
                <>
                  <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("rename")} disabled={busy} onClick={() => setEditing(b)}>
                    <Pencil className="size-4" />
                  </Button>
                  {!isHead(b) && (
                    <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-bad" aria-label={t("delete")} disabled={busy} onClick={() => void remove(b)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAdmin && !editing && (
        <Button type="button" variant="secondary" className="h-10 w-fit rounded-full px-4" onClick={() => setEditing({ no: String(branches.length).padStart(5, "0"), name: "" })}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      )}
      {editing && (
        <form
          className="grid gap-3 rounded-2xl bg-muted/50 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
            <label className="grid gap-1">
              <span className="text-[11px] text-muted-foreground">{t("number")}</span>
              <Input
                value={editing.no ?? ""}
                inputMode="numeric"
                maxLength={5}
                disabled={!!editing.id && isHead(editing as Branch)}
                onChange={(e) => setEditing({ ...editing, no: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                className="mono h-10 bg-background"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] text-muted-foreground">{t("name")}</span>
              <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-10 bg-background" autoFocus />
            </label>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("numberHint")}</p>
          <div className="grid gap-1.5" role="radiogroup" aria-label={t("color")}>
            <span className="text-[11px] text-muted-foreground">{t("color")}</span>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_NAMES.map((c) => {
                const on = (editing.color || (editing.id ? colorOf(editing as Branch, branches) : "")) === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={c}
                    onClick={() => setEditing({ ...editing, color: c })}
                    className={cn("size-8 rounded-full ring-offset-2 ring-offset-background transition-shadow", on && "ring-2 ring-foreground")}
                    style={{ background: BRANCH_COLORS[c][0] }}
                  />
                );
              })}
            </div>
          </div>
          <label className="grid gap-1">
            <span className="text-[11px] text-muted-foreground">{t("salesTarget")}</span>
            <MoneyInput className="h-10 bg-background" value={editing.salesTarget ?? 0} onChange={(v) => setEditing({ ...editing, salesTarget: Number(v) || 0 })} />
            <span className="text-[11px] leading-snug text-muted-foreground">{t("salesTargetHint")}</span>
          </label>
          <div className="grid gap-1.5" role="group" aria-label={t("closedDays")}>
            <span className="text-[11px] text-muted-foreground">{t("closedDays")}</span>
            <div className="flex flex-wrap gap-1.5">
              {weekdays.map((w, i) => {
                const on = (editing.closedDays ?? []).includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const now = editing.closedDays ?? [];
                      setEditing({ ...editing, closedDays: on ? now.filter((d) => d !== i) : [...now, i].sort() });
                    }}
                    className={cn(
                      "press h-9 min-w-11 rounded-full px-3 text-[13px] font-medium ring-1 ring-foreground/10",
                      on ? "bg-foreground text-background ring-foreground" : "bg-background hover:bg-muted",
                    )}
                  >
                    {w}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("closedHint")}</p>
          </div>
          {/* Branch password: staff type it after signing in to open this branch (admins never need it) */}
          {editing.id && <PinField branchId={editing.id} hasPin={pins.has(editing.id)} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" className="rounded-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("save")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Set, change or remove a branch's password (4–8 digits); staff who had the branch open must type the new one */
function PinField({ branchId, hasPin }: { branchId: string; hasPin: boolean }) {
  const t = useTranslations("branch");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (value: string) => {
    setBusy(true);
    try {
      await setBranchPin(branchId, value);
      toast.success(value ? t("pinSaved") : t("pinRemoved"));
      setPin("");
    } catch {
      toast.error(t("pinFail"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-1.5 rounded-xl bg-background/60 p-3">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="size-3.5" aria-hidden />
        {t("pinTitle")} · <b className={hasPin ? "text-ok" : ""}>{hasPin ? t("pinSet") : t("pinNone")}</b>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          autoComplete="new-password"
          type="password"
          placeholder={hasPin ? t("pinNew") : t("pinFirst")}
          className="mono h-10 w-40 bg-background tracking-[0.3em] placeholder:tracking-normal"
          aria-label={t("pinTitle")}
        />
        <Button type="button" variant="secondary" className="h-10 rounded-full" disabled={busy || pin.length < 4} onClick={() => void save(pin)}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {hasPin ? t("pinChange") : t("pinSave")}
        </Button>
        {hasPin && (
          <Button type="button" variant="ghost" className="h-10 rounded-full text-muted-foreground" disabled={busy} onClick={() => void save("")}>
            {t("pinRemove")}
          </Button>
        )}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{t("pinHint")}</p>
    </div>
  );
}
