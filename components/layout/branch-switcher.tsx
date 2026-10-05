"use client";

// Switching branch like switching accounts: the top bar shows where you are (name + colour); tapping it opens a
// sheet with "all branches" and every branch, each with this month's sales and profit, the current one ticked.
// Only when the company has more than one branch.

import { Check, ChevronDown, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ALL, BRANCH_COLORS, type Branch, branchLabel, branchSummaries, byId, colorOf } from "@/lib/branches";
import { setBranch, useBranch, useBranches } from "@/lib/branch-store";
import { useCompany } from "@/lib/company-store";
import { pick, useLedger } from "@/lib/ledger-store";
import { baht } from "@/lib/money";
import { useSales } from "@/lib/sales-store";
import { todayBangkok } from "@/lib/thai-tax";
import { cn } from "@/lib/utils";
import { useLabor } from "@/lib/labor-store";
import { useFixedCosts } from "@/lib/fixed-store";
import { useStock } from "@/lib/stock-store";
import { useMe } from "@/lib/role-store";
import { BranchPicker } from "@/components/auth/BranchGate";

export function useBranchName() {
  const t = useTranslations("branch");
  return { head: t("head"), branch: (no: string) => t("no", { no }) };
}

/** The branch being looked at: null = all branches (or only one branch) */
export function useCurrentBranch(): { branch: Branch | null; color: readonly [string, string] | null; label: string } {
  const names = useBranchName();
  const t = useTranslations("branch");
  const { branches } = useBranches();
  const selected = useBranch();
  const b = selected !== ALL ? byId(branches, selected) : null;
  if (!b || branches.length < 2) return { branch: null, color: null, label: t("all") };
  return { branch: b, color: BRANCH_COLORS[colorOf(b, branches)], label: branchLabel(b, names) };
}

/** A round badge with the branch's first letter in its colour (or a stack for "all") */
export function BranchAvatar({ branch, branches, size = "size-9", className }: { branch: Branch | null; branches: Branch[]; size?: string; className?: string }) {
  const names = useBranchName();
  if (!branch) {
    return (
      <span className={cn("grid flex-none place-items-center rounded-full bg-foreground text-background", size, className)} aria-hidden>
        <Layers className="size-[45%]" />
      </span>
    );
  }
  const [fg, bg] = BRANCH_COLORS[colorOf(branch, branches)];
  const letter = Array.from(branchLabel(branch, names).trim())[0]?.toUpperCase() ?? "•";
  return (
    <span className={cn("grid flex-none place-items-center rounded-full text-[0.95em] font-bold", size, className)} style={{ color: fg, background: bg }} aria-hidden>
      {letter}
    </span>
  );
}

export function BranchSwitcher() {
  const t = useTranslations("branch");
  const names = useBranchName();
  const { branches } = useBranches();
  const selected = useBranch();
  const current = useCurrentBranch();
  const [open, setOpen] = useState(false);
  const staff = useMe().role !== "admin";
  if (branches.length < 2) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${t("switch")}: ${current.label}`}
        className="press flex h-9 max-w-[11rem] min-w-0 items-center gap-1.5 rounded-full border bg-card py-1 pr-2 pl-1 text-[13px] font-semibold shadow-sm sm:max-w-[15rem]"
        style={current.color ? { borderColor: current.color[0] } : undefined}
      >
        <BranchAvatar branch={current.branch} branches={branches} size="size-7" className="text-xs" />
        <span className="truncate">{current.label}</span>
        <ChevronDown className="size-3.5 flex-none text-muted-foreground" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open &&
          (staff ? (
            <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("switch")}</DialogTitle>
                <DialogDescription className="text-xs">{t("staffSwitchHint")}</DialogDescription>
              </DialogHeader>
              <BranchPicker onDone={() => setOpen(false)} />
            </DialogContent>
          ) : (
            <SwitchSheet branches={branches} selected={selected} names={names} onPick={(id) => (setBranch(id), setOpen(false))} />
          ))}
      </Dialog>
    </>
  );
}

/** The sheet's content (mounted only while open: the month figures are worked out then) */
function SwitchSheet({ branches, selected, names, onPick }: { branches: Branch[]; selected: string; names: ReturnType<typeof useBranchName>; onPick: (id: string) => void }) {
  const t = useTranslations("branch");
  const company = useCompany();
  const { entries } = useLedger({ all: true });
  const { sales } = useSales({ all: true });
  const { lines: labor } = useLabor({ all: true });
  const { lines: fixed } = useFixedCosts({ all: true });
  const { counts: stock } = useStock({ all: true });
  const month = todayBangkok().slice(0, 7);
  const { rows, total } = useMemo(
    () => branchSummaries(branches, pick(entries, "ledger").map((e) => e.doc), sales, month, company.taxId, labor, fixed, stock),
    [branches, entries, sales, month, company.taxId, labor, fixed, stock],
  );
  const line = (r: (typeof rows)[number]["result"]) =>
    r.days ? t("sheetLine", { sales: baht(r.salesValue), profit: baht(r.profit) }) : t("sheetCost", { cost: baht(r.purchasesCost) });

  const Row = ({ id, branch, title, sub }: { id: string; branch: Branch | null; title: string; sub: string }) => {
    const on = selected === id;
    return (
      <li>
        <button
          type="button"
          onClick={() => onPick(id)}
          aria-current={on ? "true" : undefined}
          className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted", on && "bg-muted")}
        >
          <BranchAvatar branch={branch} branches={branches} size="size-11" className="text-base" />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-[15px] font-semibold">{title}</span>
            <span className="text-xs leading-snug text-muted-foreground tabular-nums">{sub}</span>
          </span>
          {on && <Check className="size-5 flex-none text-primary" aria-label={t("current")} />}
        </button>
      </li>
    );
  };

  return (
    <DialogContent
      showCloseButton={false}
      className="top-auto bottom-0 max-h-[85dvh] max-w-full translate-y-0 gap-3 overflow-y-auto rounded-t-3xl rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] data-open:slide-in-from-bottom-8 sm:top-1/2 sm:bottom-auto sm:max-w-md sm:-translate-y-1/2 sm:rounded-3xl"
    >
      <span className="mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/25 sm:hidden" aria-hidden />
      <DialogHeader className="px-1">
        <DialogTitle className="text-lg">{t("switch")}</DialogTitle>
        <DialogDescription className="text-xs">{t("sheetHint")}</DialogDescription>
      </DialogHeader>
      <ul className="grid gap-1">
        <Row id={ALL} branch={null} title={t("allLong")} sub={line(total)} />
        <li aria-hidden className="mx-3 my-1 border-t" />
        {rows.map(({ branch, result }) => (
          <Row key={branch.id} id={branch.id} branch={branch} title={branchLabel(branch, names)} sub={line(result)} />
        ))}
      </ul>
    </DialogContent>
  );
}
