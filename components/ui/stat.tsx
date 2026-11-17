// Number tile (owner 2026-11-18, from the for-sale version): a label of at least 12px over one figure, the same in
// every card. `tone` colours the figure only; `hint` is a small line under it.

import type { ReactNode } from "react";
import { TONE_TEXT, type Tone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";

export const STAT_BOX = "grid min-w-0 content-start gap-1 rounded-xl bg-muted/50 px-3.5 py-3";
export const STAT_LABEL = "truncate text-[12.5px] leading-tight font-medium text-muted-foreground";
export const STAT_VALUE = "truncate text-xl leading-tight font-semibold tracking-tight tabular-nums";
export const STAT_HINT = "truncate text-[12px] leading-tight text-muted-foreground";

export function Stat({ label, value, hint, tone = "muted", className, title }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <div className={cn(STAT_BOX, className)} title={title}>
      <span className={STAT_LABEL}>{label}</span>
      <span className={cn(STAT_VALUE, TONE_TEXT[tone])}>{value}</span>
      {hint && <span className={STAT_HINT}>{hint}</span>}
    </div>
  );
}
