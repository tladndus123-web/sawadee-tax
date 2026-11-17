// Status badge (owner 2026-11-18, from the for-sale version): one size and shape everywhere — D-1, 기한 지남, 마감됨 …
// Tones come from lib/status-tone; a deadline badge takes its tone from dueTone(daysLeft).

import type { ReactNode } from "react";
import { dueTone, TONE_SOFT, type Tone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";

export function Badge({ tone = "muted", className, children, title }: { tone?: Tone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] leading-tight font-semibold whitespace-nowrap tabular-nums", TONE_SOFT[tone], className)}>
      {children}
    </span>
  );
}

/** A deadline badge: the words are the caller's (오늘 / D-3 / 2일 지남), the colour is shared */
export function DueBadge({ daysLeft, className, children }: { daysLeft: number; className?: string; children: ReactNode }) {
  return (
    <Badge tone={dueTone(daysLeft)} className={className}>
      {children}
    </Badge>
  );
}
