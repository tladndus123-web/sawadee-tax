// AI on the expenses and calendar screens (owner, 2026-11-06: "심심하지 않게, AI로"). Three small jobs for Sonnet:
// - the month's expense claims → a short report (headline, three points, one tip) and a line per claim worth a look
//   ("weekend beer?", "3× the usual", "same receipt again"), from the automatic checks (lib/expense-checks);
// - this week's to-do briefing from the calendar and the books (three things, in order);
// - one sentence ("rent 35,000 on the 25th every month") → a calendar date to confirm.
// The first two are kept in public.ai_notes and made again only when what they were made from changes (stamp) or
// after a day, so opening a screen does not cost a call each time. Server only.

import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { APP_MODEL, type AiEvent, parseEvent } from "./assistant";
import { booksContext, calendarContext } from "./assistant-server";
import { claimFlags, type Flag } from "./expense-checks";
import { type Claim, rowToClaim } from "./expenses";
import type { Admin } from "./line-ask-server";
import { serverCategories } from "./categories-server";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";

const MESSAGES = { en, ja, ko, th } as const;

let client: Anthropic | null = null;
const LANG_NAME: Record<string, string> = { ko: "Korean", ja: "Japanese", th: "Thai", en: "English" };
export const langOf = (v: unknown) => (typeof v === "string" && v in LANG_NAME ? v : "ja");

/** One JSON answer from Sonnet (low effort), or null */
async function ask(system: string, user: string, schema: Record<string, unknown>, maxTokens = 1800): Promise<unknown> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ maxRetries: 2 });
  const res = await client.messages.create({
    model: APP_MODEL,
    max_tokens: maxTokens,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason !== "end_turn") return null;
  try {
    return JSON.parse(res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
  } catch {
    return null;
  }
}

/** Kept, or made (and kept) when missing, made from something else, or older than `maxAgeMs` */
async function kept<T>(admin: Admin, key: string, stamp: string, maxAgeMs: number, make: () => Promise<T | null>): Promise<{ body: T; madeAt: string } | null> {
  const { data } = await admin.from("ai_notes").select("body, stamp, made_at").eq("key", key).maybeSingle();
  if (data && data.stamp === stamp && Date.now() - Date.parse(data.made_at as string) < maxAgeMs) return { body: data.body as T, madeAt: data.made_at as string };
  const body = await make();
  if (!body) return data ? { body: data.body as T, madeAt: data.made_at as string } : null;
  const madeAt = new Date().toISOString();
  await admin.from("ai_notes").upsert({ key, body, stamp, made_at: madeAt });
  return { body, madeAt };
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
/** Bumped when the prompts change, so kept answers are made again */
const PROMPTS = "3";
const hash = (s: string) => crypto.createHash("sha1").update(`${PROMPTS}|${s}`).digest("hex").slice(0, 16);
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Expenses ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ExpenseReport {
  headline: string;
  points: string[];
  tip: string;
  /** claim id → one short line */
  notes: Record<string, string>;
}

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "points", "tip", "notes"],
  properties: {
    headline: { type: "string" },
    points: { type: "array", items: { type: "string" } },
    tip: { type: "string" },
    notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "text"], properties: { n: { type: "integer" }, text: { type: "string" } } } },
  },
} as const;

const flagWords = (f: Flag) =>
  f.kind === "mismatch" ? `amount differs from the receipt (${(f.n ?? 0) / 100})` : f.kind === "old" ? `${f.n} days old` : f.kind === "big" ? `much more than this person's usual (${(f.n ?? 0) / 100})` : f.kind === "personal" ? `looks personal: "${f.word}"` : f.kind === "dupPhoto" ? "the same receipt photo was already used" : f.kind === "dupReceipt" ? "the same receipt was already claimed" : "no receipt photo";

/** The pure part: the claims of a month as lines for the model (rejected ones left out) */
export function claimLines(all: Claim[], month: string, flags: (c: Claim) => Flag[], catName: (key: string) => string = (k) => k): { lines: string[]; ids: string[] } {
  const mine = all.filter((c) => c.day.startsWith(month) && c.status !== "rejected").sort((a, b) => a.day.localeCompare(b.day));
  const lines = mine.map((c, i) => {
    const item = c.doc?.items?.[0]?.desc;
    const what = item ? item.en || item.th || item.ja : "";
    const f = flags(c);
    return `#${i + 1} ${c.day} ${WEEKDAY[new Date(`${c.day}T00:00:00Z`).getUTCDay()]} · ${c.name || "?"} · ${c.seller || "—"} · ${catName(c.category)} · ${(c.amount / 100).toFixed(0)} THB · ${c.status}${what ? ` · bought: ${what}` : ""}${c.note ? ` · note: ${c.note}` : ""}${f.length ? ` · CHECKS: ${f.map(flagWords).join("; ")}` : ""}`;
  });
  return { lines, ids: mine.map((c) => c.id) };
}

export async function expenseReport(admin: Admin, month: string, lang: string): Promise<{ body: ExpenseReport; madeAt: string } | null> {
  const [{ data: rows }, { data: photos }, cats] = await Promise.all([
    admin.from("expense_claims").select("*"),
    admin.from("documents").select("id, photo_hash").is("deleted_at", null).not("photo_hash", "is", null),
    serverCategories(),
  ]);
  // Categories as the reader's words (the company's own name, else the built-in one), never the key
  const words = (MESSAGES[lang as keyof typeof MESSAGES] ?? MESSAGES.en).category as Record<string, string>;
  const catName = (k: string) => {
    const own = cats.find((c) => c.key === k)?.name as Record<string, string | undefined> | undefined;
    return own?.[lang]?.trim() || words[k] || own?.en?.trim() || k;
  };
  const claims = (rows ?? []).map((r) => rowToClaim(r as Record<string, unknown>));
  const ledgerPhotos = (photos ?? []).map((d) => ({ id: d.id as string, hash: d.photo_hash as string }));
  const { lines, ids } = claimLines(claims, month, (c) => claimFlags(c, { claims, ledgerPhotos }), catName);
  if (!lines.length) return null;
  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const prevTotal = claims.filter((c) => c.day.startsWith(prev) && c.status !== "rejected").reduce((a, c) => a + c.amount, 0) / 100;
  const stamp = hash(`${lang}|${prevTotal}|${lines.join("\n")}`);
  return kept<ExpenseReport>(admin, `exp:${month}:${lang}`, stamp, 7 * 86_400_000, async () => {
    const raw = (await ask(
      `You look over a small Thai shop's staff expense claims (money staff paid themselves and claim back) for the owner. ` +
        `Write in ${LANG_NAME[lang]}, plainly, like a careful bookkeeper. headline: one sentence with the month's total and what ` +
        `stands out. points: at most three short facts (biggest category with its share, who claimed most, a pattern such as many ` +
        `small buys at the same shop). tip: one concrete suggestion to save money or time (e.g. buy in bulk at Makro instead of ` +
        `many convenience-store trips) — only if the data supports it, else an empty string. notes: for claims worth a look only ` +
        `(alcohol or personal things, a weekend or late purchase that looks personal, an amount far above the rest, the same ` +
        `receipt twice), one short line each (max 60 characters), n = the claim number; most claims get no note. The screen ` +
        `already shows the CHECKS ("no receipt photo" and the like): do not repeat them in a note — say only what they do not. ` +
        `Category names are keys (supplies, consumables, food, transport, fuel, repairs, office …): write them as words in ` +
        `${LANG_NAME[lang]}, never the key. Never invent numbers.`,
      `Month ${month}. Previous month total: ${prevTotal} THB.\n${lines.join("\n")}`,
      REPORT_SCHEMA,
    )) as { headline?: unknown; points?: unknown; tip?: unknown; notes?: unknown } | null;
    if (!raw) return null;
    const notes: Record<string, string> = {};
    for (const n of Array.isArray(raw.notes) ? (raw.notes as { n?: unknown; text?: unknown }[]) : []) {
      const id = ids[Number(n.n) - 1];
      const text = str(n.text, 120);
      if (id && text) notes[id] = text;
    }
    return {
      headline: str(raw.headline, 240),
      points: (Array.isArray(raw.points) ? raw.points : []).map((p) => str(p, 200)).filter(Boolean).slice(0, 3),
      tip: str(raw.tip, 240),
      notes,
    };
  });
}

// ── Calendar ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface WeekBrief {
  summary: string;
  items: { title: string; why: string; link: string }[];
}

const LINKS = ["/ledger", "/sales", "/payroll", "/calendar", "/expenses", "/vendors", ""] as const;
const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "items"],
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["title", "why", "link"], properties: { title: { type: "string" }, why: { type: "string" }, link: { type: "string", enum: [...LINKS] } } },
    },
  },
} as const;

export async function weekBrief(admin: Admin, today: string, lang: string): Promise<{ body: WeekBrief; madeAt: string } | null> {
  const [cal, books] = await Promise.all([calendarContext(admin, today), booksContext(admin, today, false)]);
  return kept<WeekBrief>(admin, `brief:${today}:${lang}`, hash(cal), 6 * 3_600_000, async () => {
    const raw = (await ask(
      `You brief the owner of a small company in Thailand on this week (today is ${today}, Bangkok). From the calendar and the ` +
        `books below pick the three most important things to do in the next 7 days, in the order to do them: deadlines first ` +
        `(late ones before all), then payments due, then preparation (e.g. documents still to check before the VAT return). ` +
        `Write in ${LANG_NAME[lang]}. title: the task with its day and amount when there is one, short (max 50 characters). ` +
        `why: one short reason (max 80 characters). link: the app page to do it on. summary: one sentence on the week. ` +
        `Use only what is in the data. Never quote English button names; describe things in the reader's language.`,
      `${cal}\n\n${books}`,
      BRIEF_SCHEMA,
      1200,
    )) as { summary?: unknown; items?: unknown } | null;
    if (!raw) return null;
    const items = (Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [])
      .map((i) => ({ title: str(i.title, 80), why: str(i.why, 140), link: (LINKS as readonly string[]).includes(String(i.link)) ? String(i.link) : "" }))
      .filter((i) => i.title)
      .slice(0, 3);
    return items.length ? { summary: str(raw.summary, 200), items } : null;
  });
}

const EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "title", "date", "repeat", "remindDays", "amount", "note"],
  properties: {
    found: { type: "boolean" },
    title: { type: "string" },
    date: { type: "string" },
    repeat: { type: "string", enum: ["none", "monthly", "yearly"] },
    remindDays: { type: "integer", enum: [0, 3, 7, 30] },
    amount: { anyOf: [{ type: "number" }, { type: "null" }] },
    note: { type: "string" },
  },
} as const;

/** One sentence → a calendar date to confirm (null: no date in it) */
export async function eventFromText(text: string, today: string, lang: string): Promise<AiEvent | null> {
  const raw = (await ask(
    `Turn the owner's sentence into one calendar date for a small company in Thailand. Today is ${today}. title: short, in ` +
      `${LANG_NAME[lang]}. date: YYYY-MM-DD, the first time it falls on or after today (for "every month on the 25th": the next 25th). ` +
      `repeat: monthly / yearly / none. remindDays: 3 for payments, 30 for renewals and expiries, else 7. amount: baht as a number ` +
      `when the sentence has one (35,000 / 35k / 3.5万), else null. note: anything else useful, short, or "". found = false when the ` +
      `sentence has no date at all.`,
    text.slice(0, 500),
    EVENT_SCHEMA,
    600,
  )) as Record<string, unknown> | null;
  if (!raw || raw.found !== true) return null;
  return parseEvent(raw);
}
