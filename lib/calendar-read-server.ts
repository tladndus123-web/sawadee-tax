// A contract, licence or permit photographed (or its PDF) → the dates worth a reminder (owner, 2026-10-28: "계약서·허가증
// 찍으면 만료일 자동 등록"). Claude reads the document and lists its expiry / renewal / notice / payment dates with a
// short title in the reader's language; the person picks which go into the calendar. Server only.

import Anthropic from "@anthropic-ai/sdk";
import { readingSetup } from "./extract-server";

let client: Anthropic | null = null;

export const DATE_KINDS = ["expiry", "renewal", "notice", "payment", "other"] as const;
export type DateKind = (typeof DATE_KINDS)[number];

export interface FoundDate {
  title: string;
  date: string;
  kind: DateKind;
  repeat: "none" | "monthly" | "yearly";
  /** Satang, when the date is a payment with an amount */
  amount: number | null;
  note: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["document", "dates"],
  properties: {
    document: { type: "string" },
    dates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "date", "kind", "repeat", "amount", "note"],
        properties: {
          title: { type: "string" },
          date: { type: "string" },
          kind: { type: "string", enum: [...DATE_KINDS] },
          repeat: { type: "string", enum: ["none", "monthly", "yearly"] },
          amount: { anyOf: [{ type: "number" }, { type: "null" }] },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

const LANG_NAME: Record<string, string> = { ja: "Japanese", th: "Thai", en: "English", ko: "Korean" };

export type CalendarReadResult = { ok: true; document: string; dates: FoundDate[] } | { ok: false; code: "noKey" | "none" | "failed" };

/** Pure: the model's answer → clean dates (valid days, short texts, at most 6) */
export function cleanDates(raw: unknown, today: string): FoundDate[] {
  const list = (raw && typeof raw === "object" && Array.isArray((raw as { dates?: unknown }).dates) ? (raw as { dates: Record<string, unknown>[] }).dates : []) as Record<string, unknown>[];
  const out: FoundDate[] = [];
  for (const d of list) {
    const date = String(d.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) continue;
    // Dates long gone are of no use for a reminder (a yearly one is still: it comes back)
    if (date < today && d.repeat !== "yearly" && d.repeat !== "monthly") continue;
    const kind = (DATE_KINDS as readonly string[]).includes(String(d.kind)) ? (d.kind as DateKind) : "other";
    const repeat = d.repeat === "monthly" || d.repeat === "yearly" ? d.repeat : "none";
    const amount = typeof d.amount === "number" && d.amount > 0 ? Math.round(d.amount * 100) : null;
    const title = String(d.title ?? "").trim().slice(0, 120);
    if (!title) continue;
    out.push({ title, date, kind, repeat, amount, note: String(d.note ?? "").trim().slice(0, 300) });
  }
  return out.slice(0, 6);
}

export async function readDocumentDates(file: Buffer, type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf", lang: string, today: string, signal?: AbortSignal): Promise<CalendarReadResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, code: "noKey" };
  try {
    client ??= new Anthropic({ maxRetries: 2 });
    const source =
      type === "application/pdf"
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: file.toString("base64") } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: type, data: file.toString("base64") } };
    const res = await client.messages.create(
      {
        model: readingSetup().model,
        max_tokens: 4000,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system:
          `You read business documents of a small company in Thailand (leases, business licences, permits, work permits, visas, ` +
          `insurance policies, service contracts, loan schedules) and list the dates the owner must not miss. Today is ${today}. ` +
          `For each date: title = what happens, short (e.g. "Shop lease ends", "Liquor licence renewal"), written in ${LANG_NAME[lang] ?? "English"}; ` +
          `date = YYYY-MM-DD in the Gregorian calendar (Thai Buddhist years minus 543); kind = expiry / renewal / notice (last day to give ` +
          `notice) / payment / other; repeat = monthly or yearly for regular payments or renewals, else none (for a monthly payment give ` +
          `the next due date); amount in baht when the date is a payment of a stated amount, else null; note = one short line ` +
          `(the other party, the document number) in the same language. document = what the document is, short, same language. ` +
          `Only dates printed in the document or plainly derived from it (a notice period before the end date). No dates at all: an empty list.`,
        messages: [{ role: "user", content: [source, { type: "text", text: "List the dates." }] }],
      },
      { signal },
    );
    if (res.stop_reason !== "end_turn") return { ok: false, code: "failed" };
    const parsed = JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as { document?: string };
    const dates = cleanDates(parsed, today);
    if (!dates.length) return { ok: false, code: "none" };
    return { ok: true, document: String(parsed.document ?? "").slice(0, 120), dates };
  } catch (e) {
    if (signal?.aborted) throw e;
    console.error("calendar read:", e instanceof Error ? e.message : e);
    return { ok: false, code: "failed" };
  }
}
