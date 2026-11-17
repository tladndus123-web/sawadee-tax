// One colour rule for status badges (owner 2026-11-18, from the for-sale version's "UI 정리"): a deadline 3 days away or
// less (or past) is red, within a week amber, further off the brand blue. Every D-day badge takes its tone from here.

export type Tone = "bad" | "warn" | "ok" | "brand" | "muted";

export const RED_DAYS = 3;
export const AMBER_DAYS = 7;

export function dueTone(daysLeft: number): "bad" | "warn" | "brand" {
  if (daysLeft <= RED_DAYS) return "bad";
  if (daysLeft <= AMBER_DAYS) return "warn";
  return "brand";
}

/** Soft background + text colour (badges, chips, small status pills) */
export const TONE_SOFT: Record<Tone, string> = {
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  brand: "bg-brand-soft text-brand",
  muted: "bg-muted text-muted-foreground",
};

/** Text colour only (a figure inside a tile) */
export const TONE_TEXT: Record<Tone, string> = {
  bad: "text-bad",
  warn: "text-warn",
  ok: "text-ok",
  brand: "text-brand",
  muted: "text-foreground",
};
