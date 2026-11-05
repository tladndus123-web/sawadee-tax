// A work-schedule photo → day codes per person (lib/schedule-read cleans and matches them). Sonnet 5.5 reads it, Opus
// 5.5 when 3 or more photos are read together (lib/extract-server readingFor, owner's rule 2026-11-06). Server only.

import Anthropic from "@anthropic-ai/sdk";
import { readingFor, type SourceType } from "./extract-server";
import { cleanSheet, type SheetReading } from "./schedule-read";

let client: Anthropic | null = null;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isSchedule", "month", "blankIsWork", "people"],
  properties: {
    isSchedule: { type: "boolean" },
    month: { type: "string" },
    blankIsWork: { type: "boolean" },
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["n", "name", "days"],
        properties: { n: { type: "integer" }, name: { type: "string" }, days: { type: "array", items: { type: "string" } } },
      },
    },
  },
} as const;

export type ScheduleOutcome = { ok: true; sheet: SheetReading } | { ok: false; code: "noKey" | "notSchedule" | "failed" };

export async function readSchedule(
  file: Buffer,
  type: SourceType,
  month: string,
  staff: { id: string; name: string; nickname: string }[],
  batch: number,
  signal?: AbortSignal,
): Promise<ScheduleOutcome> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, code: "noKey" };
  const { model, effort } = readingFor(batch);
  const data = file.toString("base64");
  const source: Anthropic.ContentBlockParam =
    type === "application/pdf" ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } } : { type: "image", source: { type: "base64", media_type: type, data } };
  const list = staff.map((e, i) => `${i + 1}. ${e.name}${e.nickname ? ` (nickname ${e.nickname})` : ""}`).join("\n");
  try {
    client ??= new Anthropic({ maxRetries: 2 });
    const res = await client.messages.create(
      {
        model,
        max_tokens: 16000,
        output_config: { effort, format: { type: "json_schema", schema: SCHEMA } },
        system:
          `You read a staff work schedule (shift roster) of a small shop in Thailand: a paper sheet, a whiteboard, a printed ` +
          `table or a spreadsheet screenshot, written in Thai, English, Japanese or Korean. month: the month it covers as ` +
          `YYYY-MM (Gregorian; Thai Buddhist years minus 543), or "" if it does not show one. For each person on it: n = the ` +
          `number of the same person in the staff list below (match names, nicknames and Thai spellings; 0 if not on the list), ` +
          `name = the name as written. days = one code per day of the month, day 1 first, exactly as many as the month has ` +
          `days: "W" = works (any shift or times such as 9-18; "W+2" = 2 hours overtime written for that day), "O" = day off ` +
          `(OFF, หยุด, 休, 휴, ✕ for off), "A" = annual / holiday leave (ลาพักร้อน, AL, 有給, 연차), "S" = sick leave (ลาป่วย, SL), ` +
          `"X" = absent without pay, "" = blank or unreadable. If the sheet is laid out by week or date ranges, place each ` +
          `code on its date. blankIsWork = true only when the sheet plainly marks just the days off and leave (its blank days ` +
          `are work days). isSchedule = false if this is not a work schedule.\n\nStaff list (month ${month}):\n${list || "(empty)"}`,
        messages: [{ role: "user", content: [source, { type: "text", text: "Read the schedule." }] }],
      },
      { signal },
    );
    if (res.stop_reason !== "end_turn") return { ok: false, code: "failed" };
    const raw = JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")) as { isSchedule?: boolean };
    if (raw.isSchedule === false) return { ok: false, code: "notSchedule" };
    const sheet = cleanSheet(raw, month, staff);
    if (!sheet.people.some((p) => p.cells.length)) return { ok: false, code: "notSchedule" };
    return { ok: true, sheet };
  } catch (e) {
    if (signal?.aborted) throw e;
    console.error("schedule read:", e instanceof Error ? e.message : e);
    return { ok: false, code: "failed" };
  }
}
