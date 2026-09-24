"use client";

import { useTranslations } from "next-intl";
import type { FormMode } from "@/lib/form-labels";
import { fmt } from "@/lib/money";
import type { TotalKey, Totals } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./fields";
import { useFormLabels } from "./form-config-context";
import { NumIn } from "./form-inputs";

// Order printed on Thai tax invoices; "sub" lines are deductions, indented
const STEPS: { k: TotalKey; sub?: boolean }[] = [
  { k: "total" },
  { k: "discount", sub: true },
  { k: "afterDisc" },
  { k: "deposit", sub: true },
  { k: "afterDep" },
  { k: "exempt", sub: true },
  { k: "taxable" },
  { k: "vat" },
  { k: "net" },
];

function Row({ k, sub, children, mode, edit }: { k: TotalKey; sub?: boolean; children: React.ReactNode; mode: FormMode; edit?: boolean }) {
  const net = k === "net";
  const wht = k === "wht";
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_minmax(0,140px)] items-center gap-3 border-b border-rule-soft px-3 py-1.5",
        net && "border-b-0 bg-brand-soft py-2.5",
        wht && "border-t border-t-rule border-b-0",
      )}
    >
      <FieldLabel k={k} mode={mode} edit={edit} className={cn(sub && "pl-3", net && "font-semibold text-foreground")} />
      <div className={cn("num", net && "text-base font-semibold text-brand")}>{children}</div>
    </div>
  );
}

export function TotalsLadderView({ totals, mode }: { totals: Totals; mode: FormMode }) {
  const { show } = useFormLabels();
  // Company setting: drop a 0 discount / deposit / exempt line (and the "after" line it would repeat)
  const skip = new Set<TotalKey>();
  if (!show("zeroLines")) {
    if (!totals.discount) skip.add("discount").add("afterDisc");
    if (!totals.deposit) skip.add("deposit").add("afterDep");
    if (!totals.exempt) skip.add("exempt");
  }
  const steps = STEPS.filter(({ k }) => !skip.has(k));
  return (
    <div className="grid border border-rule">
      {steps.map(({ k, sub }) => (
        <Row key={k} k={k} sub={sub} mode={mode}>
          {fmt(totals[k])}
        </Row>
      ))}
      {show("wht") && !!totals.wht && (
        <Row k="wht" mode={mode}>
          {fmt(totals.wht)}
        </Row>
      )}
    </div>
  );
}

export function TotalsLadderEdit({ mode }: { mode: FormMode }) {
  const t = useTranslations("labels");
  return (
    <div className="grid border border-rule">
      {[...STEPS, { k: "wht" as const, sub: false }].map(({ k, sub }) => (
        <Row key={k} k={k} sub={sub} mode={mode} edit>
          <NumIn name={`totals.${k}`} label={t(k)} className={cn(k === "net" && "font-semibold")} />
        </Row>
      ))}
    </div>
  );
}
