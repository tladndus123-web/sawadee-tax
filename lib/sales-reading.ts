// What the AI read from a sales summary (lib/extract-sales), tidied: one entry per business day and channel. A POS
// closing report can list the delivery apps beside the shop's own sales, and an app summary can cover several days,
// so one picture may give several entries (owner, 2026-10-09). Money in satang while adding up.

import { fromSatang, toSatang } from "./money";
import { CHANNELS, type Channel, vatInsideSales } from "./sales";

export type SalesReading = {
  date: string;
  channel: Channel;
  docFrom: string;
  docTo: string;
  bills: number;
  gross: number;
  vat: number;
  exempt: number;
  confidence: "high" | "medium" | "low";
  unclear: string[];
};

/** At most this many entries from one picture (a month of one app) */
export const MAX_ENTRIES = 31;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v * 100) / 100) : Math.max(0, Number(String(v ?? "").replace(/,/g, "")) || 0));

function one(json: Record<string, unknown>): SalesReading {
  const date = typeof json.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : "";
  const channel = (CHANNELS as readonly string[]).includes(String(json.channel)) ? (json.channel as Channel) : "store";
  const gross = num(json.gross);
  const exempt = num(json.exempt);
  const unclear = Array.isArray(json.unclear) ? json.unclear.map(String) : [];
  // No VAT printed for this line (e.g. a delivery app's part of a Z report): 7 % inside the sales, to check
  const vatGiven = json.vat !== null && json.vat !== undefined && json.vat !== "";
  const vat = vatGiven ? num(json.vat) : vatInsideSales(gross, exempt);
  if (!vatGiven && !unclear.includes("vat")) unclear.push("vat");
  if (!date && !unclear.includes("date")) unclear.push("date");
  return {
    date,
    channel,
    docFrom: String(json.docFrom ?? "").trim(),
    docTo: String(json.docTo ?? "").trim(),
    bills: Math.round(num(json.bills)),
    gross,
    vat,
    exempt,
    confidence: json.confidence === "high" || json.confidence === "low" ? json.confidence : "medium",
    unclear,
  };
}

/**
 * The reply as entries. Accepts {"entries": [...]} and, from older prompts, one flat entry. Lines of the same day and
 * channel are added up (e.g. GrabFood and GrabMart); empty lines are dropped.
 */
export function parseSalesReply(json: Record<string, unknown>): { notReport: true } | { notReport: false; readings: SalesReading[] } {
  if (json.notReport === true) return { notReport: true };
  const raw = Array.isArray(json.entries) ? (json.entries as Record<string, unknown>[]) : [json];
  const out: SalesReading[] = [];
  for (const r of raw.slice(0, MAX_ENTRIES).filter((x) => x && typeof x === "object").map(one)) {
    if (!r.gross) continue;
    const same = out.find((x) => x.date === r.date && x.channel === r.channel);
    if (!same) {
      out.push(r);
      continue;
    }
    same.gross = fromSatang(toSatang(same.gross) + toSatang(r.gross));
    same.vat = fromSatang(toSatang(same.vat) + toSatang(r.vat));
    same.exempt = fromSatang(toSatang(same.exempt) + toSatang(r.exempt));
    same.bills += r.bills;
    same.unclear = [...new Set([...same.unclear, ...r.unclear])];
  }
  return out.length ? { notReport: false, readings: out } : { notReport: true };
}
