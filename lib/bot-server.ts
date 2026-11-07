// What a connected AI agent (Grok Bot, owner 2026-11-08) may do with the books, as MCP tools (lib/mcp.ts): read a day,
// the books' overview, the calendar and the month's tax return numbers; put dates in the tax calendar and take out the
// ones it put there. Nothing else — no documents changed, no payments, no messages sent. The whole company (an owner
// made the key). Amounts in baht.

import { isUnpaid } from "./archive";
import { booksContext, calendarContext } from "./assistant-server";
import { hashKey, keyFromHeader } from "./bot-keys";
import { needsCheck } from "./dashboard";
import { rowToClaim } from "./expenses";
import { buildPp30, buildWhtFiling, carriedIn, filingDeadlines, filingMonth } from "./filing";
import { ledger, salesTarget, shiftDay, type Admin } from "./line-ask-server";
import type { McpTool } from "./mcp";
import { CHANNELS, type Channel, type Sale } from "./sales";
import { isIsoDate, todayBangkok } from "./thai-tax";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The key's row if the key is live; marks it used (at most once a minute) */
export async function keyOwner(admin: Admin, header: string | null): Promise<{ id: string; name: string } | null> {
  const key = keyFromHeader(header);
  if (!key) return null;
  const { data } = await admin.from("bot_keys").select("id, name, last_used_at").eq("key_hash", hashKey(key)).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  if (!data.last_used_at || Date.now() - Date.parse(data.last_used_at as string) > 60_000) {
    await admin.from("bot_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { id: data.id as string, name: data.name as string };
}

async function allSales(admin: Admin, from?: string, to?: string): Promise<Sale[]> {
  let q = admin.from("sales").select("id, branch_id, sale_date, channel, doc_from, doc_to, bills, gross, vat, exempt, note, source, part");
  if (from) q = q.gte("sale_date", from);
  if (to) q = q.lte("sale_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    branchId: (r.branch_id as string | null) ?? "",
    date: r.sale_date as string,
    channel: ((CHANNELS as readonly string[]).includes(r.channel as string) ? r.channel : "other") as Channel,
    docFrom: (r.doc_from as string) ?? "",
    docTo: (r.doc_to as string) ?? "",
    bills: Number(r.bills) || 0,
    gross: Number(r.gross) || 0,
    vat: Number(r.vat) || 0,
    exempt: Number(r.exempt) || 0,
    note: (r.note as string) ?? "",
    photoPath: null,
    source: r.source as Sale["source"],
    part: Number(r.part) || 1,
  }));
}

const salesTotals = (rows: Sale[]) => {
  const by = new Map<string, { gross: number; withoutVat: number; reports: number }>();
  let gross = 0;
  let vat = 0;
  for (const s of rows) {
    gross += s.gross;
    vat += s.vat;
    const c = by.get(s.channel) ?? { gross: 0, withoutVat: 0, reports: 0 };
    c.gross = r2(c.gross + s.gross);
    c.withoutVat = r2(c.withoutVat + s.gross - s.vat);
    c.reports += 1;
    by.set(s.channel, c);
  }
  return { gross: r2(gross), vat: r2(vat), withoutVat: r2(gross - vat), byChannel: Object.fromEntries(by) };
};

/** One day: sales (and the same weekday a week before), the month so far against the target, what came into the books */
export async function daySummary(admin: Admin, date: string, today = todayBangkok()) {
  const month = date.slice(0, 7);
  const [sales, books, target, claims] = await Promise.all([
    allSales(admin, `${month}-01`, date),
    ledger(admin),
    salesTarget(admin, month),
    admin.from("expense_claims").select("*"),
  ]);
  const weekAgo = shiftDay(date, -7);
  const prev = await allSales(admin, weekAgo, weekAgo);
  const day = sales.filter((s) => s.date === date);
  const mtd = salesTotals(sales.filter((s) => s.date <= date));
  const came = books.saved.filter((d) => d.created === date);
  const flagged = needsCheck(books.saved, books.taxId, today);
  const unpaid = books.saved.filter((d) => isUnpaid(d.doc));
  const dueThatDay = unpaid.filter((d) => d.doc.dueDate === date);
  const overdue = unpaid.filter((d) => d.doc.dueDate && d.doc.dueDate < today);
  const cs = (claims.data ?? []).map((r) => rowToClaim(r as Record<string, unknown>));
  const name = (d: (typeof came)[number]) => d.doc.seller.name.en || d.doc.seller.name.th || d.doc.seller.name.ja || "?";
  return {
    date,
    sales: { ...salesTotals(day), sameWeekdayLastWeek: salesTotals(prev).withoutVat, daysWithSalesThisMonth: new Set(sales.map((s) => s.date)).size },
    monthSoFar: { salesWithoutVat: mtd.withoutVat, targetWithoutVat: target || null, targetReachedPct: target ? Math.round((mtd.withoutVat / target) * 1000) / 10 : null },
    documentsAdded: {
      count: came.length,
      total: r2(came.reduce((a, d) => a + d.doc.totals.net, 0)),
      list: came.slice(0, 15).map((d) => ({ supplier: name(d), total: d.doc.totals.net, category: d.doc.category, paid: d.doc.paid })),
    },
    toCheck: { documentsNeedingALook: flagged.size, draftsNotSaved: books.drafts.length },
    bills: {
      dueThatDay: dueThatDay.map((d) => ({ supplier: name(d), total: d.doc.totals.net })),
      overdueCount: overdue.length,
      overdueTotal: r2(overdue.reduce((a, d) => a + d.doc.totals.net, 0)),
      unpaidTotal: r2(unpaid.reduce((a, d) => a + d.doc.totals.net, 0)),
    },
    staffClaims: {
      sentThatDay: cs.filter((c) => c.day === date).length,
      waitingForApproval: cs.filter((c) => c.status === "pending").length,
    },
    note: "Amounts in Thai baht. Sales 'withoutVat' is what targets compare with.",
  };
}

/** The month's ภ.พ.30 boxes and withholding totals (lib/filing), company-wide */
export async function filingNumbers(admin: Admin, month: string) {
  const [sales, books] = await Promise.all([allSales(admin), ledger(admin)]);
  const docs = books.saved.map((d) => d.doc);
  const { pp30, from } = buildPp30(sales, docs, month, books.taxId);
  const carried = carriedIn(sales, docs, month, books.taxId);
  const wht = buildWhtFiling(books.saved, month);
  const net = Math.round(pp30.toPay * 100) - Math.round(pp30.overpaid * 100) - Math.round(carried * 100);
  return {
    month,
    deadlines: filingDeadlines(month),
    vatPP30: { ...pp30, box10CarriedIn: carried, box11NetToPay: Math.max(net, 0) / 100, box12NetOverpaid: Math.max(-net, 0) / 100 },
    sources: from,
    withholding: { pnd53: wht.totals.pnd53, pnd3: wht.totals.pnd3, payeesWithBadTaxId: wht.badIds.length, unpaidWithholdingDocuments: wht.unpaid },
    note: "For reference; the accountant checks before filing. Box 10 assumes last month's overpaid VAT was carried, not refunded.",
  };
}

const dateArg = (v: unknown, fallback: string) => {
  const s = typeof v === "string" && v ? v : fallback;
  if (!isIsoDate(s)) throw new Error("date must be YYYY-MM-DD");
  return s;
};

/** The tools, for one request */
export function botTools(admin: Admin, appUrl: string, today = todayBangkok()): McpTool[] {
  return [
    {
      name: "day_summary",
      description:
        "One day of the restaurant's books (Thailand, Bangkok time): sales by channel with and without VAT, the same weekday a week before, the month so far against the sales target, documents added that day, bills due or overdue, documents to check, staff expense claims. Use it for the daily wrap-up.",
      inputSchema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD; default today (Bangkok)" } }, additionalProperties: false },
      run: (a) => daySummary(admin, dateArg(a.date, today), today),
    },
    {
      name: "books_overview",
      description: "The whole books as short text: recent months (sales, purchases, profit), recent days, branches, unpaid bills, suppliers, price rises, VAT, payroll. Use it for questions about trends or comparisons.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: () => booksContext(admin, today, true, appUrl),
    },
    {
      name: "calendar",
      description: "What is coming in the next 45 days (and what is late): tax filing deadlines, bills to pay, staff papers expiring, company dates, staff expense claims waiting, days without sales entered.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      run: () => calendarContext(admin, today),
    },
    {
      name: "tax_return_numbers",
      description: "The numbers for a month's VAT return (ภ.พ.30 boxes 1–12) and withholding tax returns (ภ.ง.ด.53 / ภ.ง.ด.3 totals), with deadlines and what to fix first.",
      inputSchema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM; default the month being filed now" } }, additionalProperties: false },
      run: (a) => {
        const m = typeof a.month === "string" && a.month ? a.month : filingMonth(today);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new Error("month must be YYYY-MM");
        return filingNumbers(admin, m);
      },
    },
    {
      name: "add_calendar_date",
      description:
        "Put a date in the company's tax calendar (a booking, a supplier call, a payment to remember). It shows in the app and the morning LINE reminder. Ask the owner before adding if they did not ask for it.",
      writes: true,
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Up to 120 characters" },
          date: { type: "string", description: "YYYY-MM-DD" },
          note: { type: "string", description: "Optional, up to 500 characters" },
          remind_days_before: { type: "integer", description: "0–90, default 1" },
          repeat: { type: "string", enum: ["none", "monthly", "yearly"], description: "Default none" },
          amount_baht: { type: "number", description: "Optional amount to remember" },
        },
        required: ["title", "date"],
        additionalProperties: false,
      },
      run: async (a) => {
        const title = String(a.title).trim().slice(0, 120);
        const date = dateArg(a.date, "");
        const remind = a.remind_days_before === undefined ? 1 : Math.round(Number(a.remind_days_before));
        if (!(remind >= 0 && remind <= 90)) throw new Error("remind_days_before must be 0–90");
        const repeat = (a.repeat as string | undefined) ?? "none";
        if (!["none", "monthly", "yearly"].includes(repeat)) throw new Error("repeat must be none, monthly or yearly");
        const amount = a.amount_baht === undefined ? null : Math.round(Number(a.amount_baht) * 100);
        if (amount !== null && !(amount > 0)) throw new Error("amount_baht must be more than 0");
        const { data, error } = await admin
          .from("calendar_events")
          .insert({ title, date, note: String(a.note ?? "").slice(0, 500), remind_days: remind, repeat, amount, source: "bot" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return { added: true, id: data.id, title, date, repeat, remindDaysBefore: remind, open: `${appUrl}/calendar` };
      },
    },
    {
      name: "remove_calendar_date",
      description: "Take out a date this agent put in the calendar (by its id from add_calendar_date). Dates people added stay.",
      writes: true,
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      run: async (a) => {
        const id = String(a.id);
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id is not a calendar date id");
        const { data, error } = await admin.from("calendar_events").delete().eq("id", id).eq("source", "bot").select("id");
        if (error) throw new Error(error.message);
        return data?.length ? { removed: true, id } : { removed: false, reason: "not found, or added by a person (only dates this agent added can be removed)" };
      },
    },
  ];
}

export const BOT_INFO = {
  name: "sawadee-tax",
  version: "1.0.0",
  instructions:
    "Sawadee TAX: the books of a restaurant company in Thailand (receipts, sales, tax calendar). You may read summaries and put dates in the calendar; you cannot change documents, pay or send messages. For the daily wrap-up call day_summary. Amounts are Thai baht. Dates are Bangkok time.",
};

