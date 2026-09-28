"use client";

// The branch the person works in (top bar, only when the company has more than one): its books alone, or all.

import { Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { ALL, branchLabel } from "@/lib/branches";
import { setBranch, useBranch, useBranches } from "@/lib/branch-store";

export function useBranchName() {
  const t = useTranslations("branch");
  return { head: t("head"), branch: (no: string) => t("no", { no }) };
}

export function BranchSwitcher() {
  const t = useTranslations("branch");
  const names = useBranchName();
  const { branches } = useBranches();
  const selected = useBranch();
  if (branches.length < 2) return null;
  return (
    <label className="relative flex min-w-0 items-center">
      <Store className="pointer-events-none absolute left-2.5 size-3.5 text-brand" aria-hidden />
      <select
        value={selected}
        onChange={(e) => setBranch(e.target.value)}
        aria-label={t("label")}
        className="h-8 max-w-[9.5rem] truncate rounded-full border bg-card pr-6 pl-8 text-xs font-semibold sm:max-w-[13rem] sm:text-[13px]"
      >
        <option value={ALL}>{t("all")}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {branchLabel(b, names)}
          </option>
        ))}
      </select>
    </label>
  );
}
