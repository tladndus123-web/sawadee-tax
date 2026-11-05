// An iCalendar (.ics) subscription feed (RFC 5545): all-day events that Google Calendar and the iPhone calendar read
// from a secret address (owner, 2026-11-06: "마감일이 휴대폰 기본 캘린더에도"). Pure; the server fills it.

export interface IcsEvent {
  /** Stable, so the phone updates an event instead of adding it again */
  uid: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  description?: string;
  /** Days before to remind (0 = on the day at 9:00) */
  remindDays?: number;
}

/** Text as iCalendar wants it: backslash, comma, semicolon and newlines escaped */
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded (a space starts each continuation) */
export function fold(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of Array.from(line)) {
    if (bytes.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const ymd = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function buildIcs(name: string, events: IcsEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sawadee TAX//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`, "X-WR-TIMEZONE:Asia/Bangkok", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsText(e.uid)}@sawadee-tax`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.date)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`,
      `SUMMARY:${icsText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      "TRANSP:TRANSPARENT",
    );
    if (e.remindDays !== undefined) {
      // On the day at 9:00 local (-15 h from the start of the day is 9:00 the day before): days before at 9:00
      const hours = e.remindDays * 24 - 9;
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:${hours >= 0 ? "-" : ""}PT${Math.abs(hours)}H`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
