// POS Excel / CSV import. POS systems export very different sheets, so nothing is tied to one brand: the header row is
// found by its words (Thai or English), each needed column is matched by keyword, and rows — one per receipt or one
// per day — are added up into one line per day and channel, the shape public.sales keeps. The person sees the
// matched columns and a preview, and can change any column before importing.

import { fromSatang, toSatang } from "./money";
import { type Channel, vatInsideSales } from "./sales";

export type Cell = string | number | Date | null | undefined;
export type Field = "date" | "gross" | "vat" | "preVat" | "exempt" | "receipt" | "bills" | "channel";
export type ColumnMap = Partial<Record<Field, number>>;

/** Header words per field, most specific first (a column is used for one field only) */
const PATTERNS: [Field, RegExp[]][] = [
  ["date", [/business ?date|sales ?date|transaction ?date|order ?date|วันที่ขาย|วันที่/i, /^date|date$|^วัน|日付/i]],
  ["preVat", [/before ?vat|excl\.? ?vat|exclud(e|ing) ?vat|pre-?vat|ก่อน ?(ภาษี|vat)|มูลค่าก่อน|ไม่รวม ?(ภาษี|vat)|net of vat|税抜/i]],
  ["vat", [/^vat|vat ?(7|amount)|ภาษีมูลค่าเพิ่ม|^ภาษี|tax ?amount|^tax$|消費税/i]],
  ["exempt", [/exempt|non-?vat|ยกเว้น|非課税/i]],
  [
    "gross",
    [
      /net ?sales|grand ?total|total ?amount|total ?sales|ยอดขายสุทธิ|ยอดสุทธิ|ยอดชำระ|ยอดรวมทั้งสิ้น|รวมทั้งสิ้น|売上合計/i,
      /^total$|^amount$|ยอดรวม|รวมเงิน|ยอดขาย|^sales$|^net$|合計/i,
    ],
  ],
  ["bills", [/no\.? ?of ?(bills|receipts|orders)|number of|bill ?count|receipt ?count|จำนวนบิล|จำนวนใบเสร็จ|^bills$|^orders$|^transactions$|件数/i]],
  ["receipt", [/receipt|bill ?no|invoice|order ?(id|no)|doc(ument)? ?no|เลขที่|ใบเสร็จ|ใบกำกับ|伝票/i]],
  ["channel", [/channel|platform|source|sales ?type|order ?type|ช่องทาง|ประเภท|販売経路/i]],
];

const NOT_GROSS = /before|excl|ก่อน|ไม่รวม|discount|ส่วนลด|vat|ภาษี|tax|sub ?total|cost|ต้นทุน/i;

const text = (c: Cell) => (c instanceof Date ? c.toISOString() : String(c ?? "")).trim();

/** Which column holds which field (by header words); unmatched fields are left out */
export function detectColumns(headers: Cell[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<number>();
  const names = headers.map(text);
  for (const [field, pats] of PATTERNS) {
    for (const re of pats) {
      const i = names.findIndex((h, j) => !used.has(j) && h && re.test(h) && !(field === "gross" && NOT_GROSS.test(h)));
      if (i >= 0) {
        map[field] = i;
        used.add(i);
        break;
      }
    }
  }
  return map;
}

/** The header row: the first of the top rows where at least a date and an amount column are recognised */
export function findHeader(rows: Cell[][]): { index: number; map: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map = detectColumns(rows[i]);
    if (map.date !== undefined && map.gross !== undefined) return { index: i, map };
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6, "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
};

const iso = (y: number, m: number, d: number): string | null => {
  if (y > 2400) y -= 543; // Buddhist Era
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** Two-digit years: Thai POS often prints the Buddhist year (69 = 2569 = 2026) */
const fullYear = (y: number, nowYear: number) => (y >= 100 ? y : y > (nowYear % 100) + 5 ? 2500 + y : 2000 + y);

/** A date cell in any common shape → yyyy-mm-dd (Thai day/month/year, Buddhist years, Excel serials) or null */
export function parseDateCell(c: Cell, nowYear = new Date().getUTCFullYear()): string | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : iso(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate());
  if (typeof c === "number") {
    if (c < 20000 || c > 80000) return null; // Excel serial day (1900 system)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(c) * 86_400_000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = text(c);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return iso(fullYear(Number(m[3]), nowYear), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,}\.?|[ก-๙]{1,3}\.[ก-๙]{1,2}\.?)\s+(\d{2,4})/);
  if (m) {
    const key = m[2].toLowerCase().slice(0, 3);
    const mon = MONTHS[key] ?? MONTHS[m[2]] ?? MONTHS[`${m[2].replace(/\.$/, "")}.`];
    if (mon) return iso(fullYear(Number(m[3]), nowYear), mon, Number(m[1]));
  }
  return null;
}

/** A money cell → number ("1,234.50", "฿ 99", "(12.00)" = −12); empty or text → 0 */
export function parseMoney(c: Cell): number {
  if (typeof c === "number") return Number.isFinite(c) ? c : 0;
  const s = text(c).replace(/[฿,\s]|THB|บาท/gi, "");
  if (!s || s === "-") return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()-]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

/** The sales channel a cell names (delivery apps by name), else the default */
export function channelOf(c: Cell, fallback: Channel): Channel {
  const s = text(c).toLowerCase();
  if (!s) return fallback;
  if (s.includes("grab")) return "grab";
  if (s.includes("line") && s.includes("man")) return "lineman";
  if (s.includes("wongnai")) return "lineman";
  if (s.includes("panda")) return "foodpanda";
  if (s.includes("shopee")) return "shopee";
  if (s.includes("robinhood")) return "robinhood";
  return fallback;
}

export interface ImportDay {
  date: string;
  channel: Channel;
  gross: number;
  vat: number;
  exempt: number;
  bills: number;
  docFrom: string;
  docTo: string;
  /** VAT worked out as 7/107 because the file has no VAT column */
  vatComputed: boolean;
  rows: number;
}

const byNumber = new Intl.Collator("en", { numeric: true });

/** Add the data rows up into one line per day and channel. Rows without a date (totals, notes) are skipped. */
export function aggregate(rows: Cell[][], map: ColumnMap, fallback: Channel = "store", nowYear?: number): { days: ImportDay[]; skipped: number } {
  const acc = new Map<string, { d: ImportDay; gross: number; vat: number; pre: number; exempt: number; bills: number; receipts: Set<string> }>();
  let skipped = 0;
  const at = (r: Cell[], f: Field) => (map[f] === undefined ? undefined : r[map[f]!]);
  for (const r of rows) {
    const date = parseDateCell(at(r, "date"), nowYear);
    const gross = parseMoney(at(r, "gross"));
    if (!date || (!gross && !parseMoney(at(r, "vat")))) {
      if (r.some((c) => text(c))) skipped++;
      continue;
    }
    const channel = channelOf(at(r, "channel"), fallback);
    const key = `${date}|${channel}`;
    const a = acc.get(key) ?? {
      d: { date, channel, gross: 0, vat: 0, exempt: 0, bills: 0, docFrom: "", docTo: "", vatComputed: false, rows: 0 },
      gross: 0, vat: 0, pre: 0, exempt: 0, bills: 0, receipts: new Set<string>(),
    };
    a.gross += toSatang(gross);
    a.vat += toSatang(parseMoney(at(r, "vat")));
    a.pre += toSatang(parseMoney(at(r, "preVat")));
    a.exempt += toSatang(parseMoney(at(r, "exempt")));
    a.bills += Math.round(parseMoney(at(r, "bills")));
    const rec = text(at(r, "receipt"));
    if (rec) a.receipts.add(rec);
    a.d.rows++;
    acc.set(key, a);
  }
  const days = [...acc.values()].map(({ d, gross, vat, pre, exempt, bills, receipts }) => {
    const out = { ...d, gross: fromSatang(gross), exempt: fromSatang(exempt) };
    if (map.vat !== undefined) out.vat = fromSatang(vat);
    else if (map.preVat !== undefined) out.vat = fromSatang(gross - pre);
    else {
      out.vat = vatInsideSales(out.gross, out.exempt);
      out.vatComputed = true;
    }
    out.bills = map.bills !== undefined ? bills : receipts.size || d.rows;
    const sorted = [...receipts].sort(byNumber.compare);
    out.docFrom = sorted[0] ?? "";
    out.docTo = sorted.at(-1) ?? "";
    return out;
  });
  days.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
  return { days, skipped };
}

// --- Column memory (company_settings.pos_columns) ---------------------------------------------------------------
// After an import in the app, the header text of each matched column is kept, so a file the POS exports the same way
// (e.g. sent to the LINE bot) is read without anyone matching columns again.

export type SavedColumns = Partial<Record<Field, string>>;
const FIELDS: Field[] = ["date", "gross", "vat", "preVat", "exempt", "receipt", "bills", "channel"];
const headerText = (c: Cell) => String(c ?? "").trim().toLowerCase();

/** What to remember from a confirmed import: field → header text */
export function columnsToSave(headers: Cell[], map: ColumnMap): SavedColumns {
  const out: SavedColumns = {};
  for (const f of FIELDS) {
    const i = map[f];
    const h = i === undefined ? "" : String(headers[i] ?? "").trim();
    if (h) out[f] = h.slice(0, 80);
  }
  return out;
}

/** The saved columns, sane ones only */
export function posColumnsOf(raw: unknown): SavedColumns {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: SavedColumns = {};
  for (const f of FIELDS) if (typeof r[f] === "string" && r[f]) out[f] = (r[f] as string).slice(0, 80);
  return out;
}

/** The automatic match, overridden wherever a remembered header is in this file's header row */
export function applySavedColumns(headers: Cell[], auto: ColumnMap, saved: SavedColumns): ColumnMap {
  const names = headers.map(headerText);
  const map: ColumnMap = { ...auto };
  for (const f of FIELDS) {
    const want = saved[f];
    if (!want) continue;
    const i = names.indexOf(want.trim().toLowerCase());
    if (i >= 0) map[f] = i;
  }
  // One column serves one field: a saved column wins over an automatic one that landed on it
  const taken = new Map<number, Field>();
  for (const f of FIELDS) {
    const i = map[f];
    if (i === undefined) continue;
    const other = taken.get(i);
    if (other !== undefined && !saved[f] && saved[other]) delete map[f];
    else if (other !== undefined && saved[f] && !saved[other]) {
      delete map[other];
      taken.set(i, f);
    } else taken.set(i, f);
  }
  return map;
}
