// The calendar subscription (lib/ics): the same items as the calendar screen — tax deadlines, bills by due date,
// staff papers running out, the company's own dates — for the next year, titled in the reader's language. The
// address carries a secret (public.calendar_feed); this reads with the service role after checking it. Server only.

import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";
import { isUnpaid } from "./archive";
import { parseDocuments } from "./attendance";
import { type CalEvent, type CalItem, calendarItems, TAX_KINDS } from "./company-calendar";
import { buildIcs, type IcsEvent } from "./ics";
import { ledger, type Admin } from "./line-ask-server";
import { THAI_HOLIDAYS } from "./thai-holidays";
import { allRows } from "./fetch-all";

const MESSAGES = { en, ja, ko, th } as const;
type Lang = keyof typeof MESSAGES;
const DAY = 86_400_000;
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Is this the feed's secret? (constant-time compare) — feed 1 = company dates, 2 = staff schedule */
export async function feedTokenOk(admin: Admin, token: string, which: 1 | 2 = 1): Promise<boolean> {
  if (!/^[0-9a-f]{48}$/.test(token)) return false;
  const { data } = await admin.from("calendar_feed").select("token").eq("id", which).maybeSingle();
  const real = (data?.token as string | undefined) ?? "";
  if (real.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function feedIcs(admin: Admin, langIn: string, today: string): Promise<string> {
  const lang: Lang = langIn in MESSAGES ? (langIn as Lang) : "ja";
  const t = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "calendar" });
  const from = add(today, -60);
  const to = add(today, 366);
  const [{ saved }, ev, dn, staff] = await Promise.all([
    ledger(admin),
    admin.from("calendar_events").select("id, title, date, repeat, remind_days, note, amount"),
    admin.from("calendar_done").select("key"),
    admin.from("employees").select("id, name, nickname, end_date, documents"),
  ]);
  const events: CalEvent[] = (ev.data ?? []).map((r) => ({ id: r.id as string, title: r.title as string, date: r.date as string, repeat: r.repeat as CalEvent["repeat"], remindDays: Number(r.remind_days) || 0, note: (r.note as string) ?? "", amount: r.amount === null ? null : Number(r.amount) }));
  const items = calendarItems({
    from,
    to,
    vatRegistered: null,
    payroll: (staff.data ?? []).length > 0,
    employees: (staff.data ?? []).map((e) => ({ id: e.id as string, name: ((e.nickname as string) || (e.name as string)) ?? "", endDate: (e.end_date as string | null) ?? "", documents: parseDocuments(e.documents) })),
    bills: saved.filter((d) => isUnpaid(d.doc) && d.doc.dueDate).map((d) => ({ id: d.id, seller: d.doc.seller.name.en || d.doc.seller.name.th || "?", dueDate: d.doc.dueDate, net: d.doc.totals.net })),
    events,
    done: new Set((dn.data ?? []).map((r) => r.key as string)),
  });
  const monthName = (ym: string) => new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
  const title = (i: CalItem) =>
    i.kind === "vat" || i.kind === "monthly"
      ? t(`cal.${i.kind}`, { month: monthName(i.period!) })
      : TAX_KINDS.includes(i.kind)
        ? t(`cal.${i.kind}` as "cal.cert50", { year: i.period! })
        : i.kind === "doc"
          ? t("docTitle", { name: i.sub ?? "", paper: i.title ?? "" })
          : i.kind === "bill"
            ? t("billTitle", { seller: i.title ?? "" })
            : (i.title ?? "");
  const out: IcsEvent[] = items
    .filter((i) => !i.done)
    .map((i) => ({
      uid: i.key,
      date: i.date,
      title: `${title(i)}${i.amount ? ` · ฿${Math.round(i.amount).toLocaleString("en-US")}` : ""}`,
      description: [i.sub, "Sawadee TAX"].filter(Boolean).join(" · "),
      remindDays: i.kind === "event" ? (i.remindDays ?? 7) : i.kind === "bill" ? 3 : i.kind === "doc" ? 30 : 3,
    }));
  return buildIcs("Sawadee TAX", out);
}

/**
 * The staff work schedule (owner, 2026-11-06: "직원용 캘린더 (출근 관련) 공유하기 쉽게"): who works, who is off or on
 * leave, day by day from the attendance sheet (the last 2 weeks and what is already planned ahead), plus the Thai
 * public holidays. One person only with `employee`. Sick days show as "leave" (no health detail for the others);
 * absences are left out. Titles in the reader's language.
 */
export async function staffFeedIcs(admin: Admin, langIn: string, today: string, employee?: string): Promise<string> {
  const lang: Lang = langIn in MESSAGES ? (langIn as Lang) : "ja";
  const t = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "pay" });
  const tf = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "feed" });
  let staffQ = admin.from("employees").select("id, name, nickname, end_date");
  if (employee) staffQ = staffQ.eq("id", employee);
  const { data: staff } = await staffQ;
  const people = (staff ?? []).filter((e) => !e.end_date || (e.end_date as string) >= add(today, -14));
  const ids = people.map((e) => e.id as string);
  const { data: rows } = ids.length
    ? await allRows<Record<string, unknown>>(() => admin.from("attendance").select("id, employee_id, day, kind, ot_hours").in("employee_id", ids).gte("day", add(today, -14)).lte("day", add(today, 120)))
    : { data: [] };
  const nameOf = new Map(people.map((e) => [e.id as string, ((e.nickname as string) || (e.name as string) || "").trim()]));
  const out: IcsEvent[] = [];
  for (const r of rows ?? []) {
    const kind = r.kind as "work" | "off" | "absent" | "annual" | "sick";
    if (kind === "absent") continue;
    const word = kind === "sick" ? tf("leave") : t(`kind.${kind}`);
    const ot = kind === "work" && Number(r.ot_hours) > 0 ? ` +OT ${Number(r.ot_hours)}h` : "";
    out.push({ uid: `att:${r.employee_id}:${r.day}`, date: r.day as string, title: employee ? `${word}${ot}` : `${nameOf.get(r.employee_id as string) ?? "?"} · ${word}${ot}` });
  }
  for (const d of THAI_HOLIDAYS) if (d >= add(today, -14) && d <= add(today, 366)) out.push({ uid: `holiday:${d}`, date: d, title: `🇹🇭 ${tf("holiday")}` });
  const who = employee ? (nameOf.get(employee) ?? "") : "";
  return buildIcs(who ? `${tf("name")} · ${who}` : tf("name"), out.sort((a, b) => a.date.localeCompare(b.date)));
}

/** The people on the schedule (for one link each) */
export async function feedStaffIds(admin: Admin): Promise<Set<string>> {
  const { data } = await admin.from("employees").select("id");
  return new Set((data ?? []).map((e) => e.id as string));
}
