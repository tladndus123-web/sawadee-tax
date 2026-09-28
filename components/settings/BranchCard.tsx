"use client";

// Admins: the company's branches (สาขา) — number as on tax invoices, and a name. The head office is always there.

import { Loader2, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { BranchAvatar, useBranchName } from "@/components/layout/branch-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRANCH_COLORS, type Branch, branchLabel, COLOR_NAMES, colorOf, isHead } from "@/lib/branches";
import { deleteBranch, saveBranch, useBranches } from "@/lib/branch-store";
import { useMe } from "@/lib/role-store";
import { cn } from "@/lib/utils";

export function BranchCard() {
  const t = useTranslations("branch");
  const names = useBranchName();
  const isAdmin = useMe().role === "admin";
  const { branches, loaded } = useBranches();
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing) return;
    const no = (editing.no ?? "").replace(/\D/g, "").padStart(5, "0").slice(-5);
    if (!/^\d{5}$/.test(no)) return toast.error(t("badNo"));
    setBusy(true);
    try {
      await saveBranch({ id: editing.id, no, name: editing.name ?? "", sort: editing.sort ?? branches.length, color: editing.color ?? "" });
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
    <section aria-labelledby="branch-title" className="workspace-panel grid content-start gap-4 p-5 sm:p-6">
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
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{branchLabel(b, names)}</span>
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
