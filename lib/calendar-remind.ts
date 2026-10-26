// Calendar reminders on LINE (owner, 2026-10-28; ported 2026-10-27). The daily reminder job (/api/cron/due-reminders)
// already sends the VAT return, payroll filings, withholding and staff papers; this adds only what it does not cover,
// so nothing comes twice:
// - the company's own dates, on their "remind me" day and on the day itself;
// - the yearly filings (50 ทวิ, ภ.ง.ด.1ก, corporate tax ภ.ง.ด.50 / 51) 30, 7 and 1 days before and on the day.
// Ticked-off items are left out. Pure: one text in the four languages (lib/line-lang) that the cron sends as a card
// in each admin's language (lib/line-dash noticeMessage).

import { type CalItem, daysTo } from "./company-calendar";
import { four, type LineLang } from "./line-lang";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";

const ALL = { ja, th, en, ko } as const;
export const YEARLY_REMIND = [30, 7, 1, 0];
const YEARLY = ["cert50", "pnd1a", "pnd50", "pnd51"];

/** The items to remind of today */
export function dueToday(items: CalItem[], today: string): CalItem[] {
  return items.filter((i) => {
    if (i.done) return false;
    const left = daysTo(today, i.date);
    if (i.kind === "event") return left === 0 || left === (i.remindDays ?? 7);
    return YEARLY.includes(i.kind) && YEARLY_REMIND.includes(left);
  });
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const dateIn = (lang: LineLang, iso: string) =>
  new Intl.DateTimeFormat(lang === "th" ? "th-TH" : lang, { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function oneLanguage(items: CalItem[], lang: LineLang, today: string, url: string): string {
  const w = ALL[lang].calendar;
  const cal = w.cal as Record<string, string>;
  const lines = items.map((i) => {
    const title = i.kind === "event" ? (i.title ?? "") : fill(cal[i.kind] ?? i.kind, { year: i.period ?? "" });
    const left = daysTo(today, i.date);
    const when = left === 0 ? w.today : fill(w.dDay, { n: left });
    const amount = i.amount ? ` · ฿${Math.round(i.amount).toLocaleString("en-US")}` : "";
    return `• ${title} — ${dateIn(lang, i.date)} (${when})${amount}`;
  });
  return [w.remindTitle, "", ...lines, "", `${url}/calendar`].join("\n");
}

/** One text in the four languages, or null when there is nothing today */
export function reminderMessage(items: CalItem[], today: string, url: string): string | null {
  if (!items.length) return null;
  return four(oneLanguage(items, "th", today, url), oneLanguage(items, "ja", today, url), oneLanguage(items, "ko", today, url), oneLanguage(items, "en", today, url));
}
