// What a connected AI agent (Grok Bot, owner 2026-11-08) may do with the books, as MCP tools (lib/mcp.ts): read a day,
// the books' overview, the calendar and the month's tax return numbers; put dates in the tax calendar and take out the
// ones it put there. Nothing else — no documents changed, no payments, no messages sent. The whole company (an owner
// made the key). Amounts in baht.

import { isUnpaid } from "./archive";
import { booksContext, calendarContext } from "./assistant-server";
import { hashKey, keyFromHeader } from "./bot-keys";
import { findAnomalies } from "./anomalies";
import { addDocumentFromFile, fromBase64 } from "./bot-docs-server";
import { sendBotEvent, testEvent } from "./bot-events-server";
import { priceRises } from "./price-watch";
import { saleValue } from "./sales";
import { lineClient } from "./line";
import { noticeMessage } from "./line-dash";
import { LANG_SPLIT, lineLang } from "./line-lang";
import { needsCheck } from "./dashboard";
import { rowToClaim } from "./expenses";
import { buildPp30, buildWhtFiling, carriedIn, filingDeadlines, filingMonth } from "./filing";
import { ledger, salesTarget, shiftDay, type Admin } from "./line-ask-server";
import type { McpTool } from "./mcp";
import { CHANNELS, type Channel, type Sale } from "./sales";
import { isIsoDate, todayBangkok } from "./thai-tax";
import { allRows } from "./fetch-all";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The key's row if the key is live; marks it used (at most once a minute) */
export async function keyOwner(admin: Admin, header: string | null): Promise<{ id: string; name: string; createdBy: string | null } | null> {
  const key = keyFromHeader(header);
  if (!key) return null;
  const { data } = await admin.from("bot_keys").select("id, name, last_used_at, created_by").eq("key_hash", hashKey(key)).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  if (!data.last_used_at || Date.now() - Date.parse(data.last_used_at as string) > 60_000) {
    await admin.from("bot_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { id: data.id as string, name: data.name as string, createdBy: (data.created_by as string | null) ?? null };
}

async function allSales(admin: Admin, from?: string, to?: string): Promise<Sale[]> {
  const make = () => {
    let q = admin.from("sales").select("id, branch_id, sale_date, channel, doc_from, doc_to, bills, gross, vat, exempt, note, source, part");
    if (from) q = q.gte("sale_date", from);
    if (to) q = q.lte("sale_date", to);
    return q;
  };
  const { data, error } = await allRows<Record<string, unknown>>(make);
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
    allRows<Record<string, unknown>>(() => admin.from("expense_claims").select("*")),
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

/** Documents matching a search, newest first (saved ones unless asked for drafts) */
export async function findDocuments(admin: Admin, a: Record<string, unknown>, appUrl: string) {
  const books = await ledger(admin);
  const pool = a.drafts === true ? books.drafts : books.saved;
  const words = String(a.text ?? "").trim().toLowerCase();
  const from = typeof a.from === "string" ? a.from : "";
  const to = typeof a.to === "string" ? a.to : "";
  const min = typeof a.min_baht === "number" ? a.min_baht : null;
  const max = typeof a.max_baht === "number" ? a.max_baht : null;
  const limit = Math.min(Math.max(Math.round(Number(a.limit) || 20), 1), 50);
  const hits = pool
    .filter(({ doc }) => {
      const hay = [doc.seller.name.th, doc.seller.name.en, doc.seller.name.ja, doc.docNo, doc.seller.taxId, doc.memo ?? ""].join(" ").toLowerCase();
      return (
        (!words || words.split(/\s+/).every((w) => hay.includes(w))) &&
        (!from || doc.date >= from) &&
        (!to || doc.date <= to) &&
        (min === null || doc.totals.net >= min) &&
        (max === null || doc.totals.net <= max) &&
        (a.unpaid_only !== true || isUnpaid(doc))
      );
    })
    .sort((x, y) => y.doc.date.localeCompare(x.doc.date));
  return {
    found: hits.length,
    total: r2(hits.reduce((sum, d) => sum + d.doc.totals.net, 0)),
    documents: hits.slice(0, limit).map(({ id, doc }) => ({
      id,
      date: doc.date,
      supplier: doc.seller.name.en || doc.seller.name.th || doc.seller.name.ja || "?",
      docNo: doc.docNo,
      total: doc.totals.net,
      vat: doc.totals.vat,
      category: doc.category,
      paid: !isUnpaid(doc),
      dueDate: doc.dueDate || null,
      open: `${appUrl}/documents/${id}`,
    })),
  };
}

/** Each supplier's month against the month before, biggest first, with what is unpaid */
export async function supplierSummary(admin: Admin, month: string) {
  const books = await ledger(admin);
  const [y, m] = month.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const by = new Map<string, { supplier: string; taxId: string; thisMonth: number; lastMonth: number; documents: number; unpaid: number }>();
  for (const { doc } of books.saved) {
    const mk = doc.taxMonth || doc.date.slice(0, 7);
    const k = doc.seller.taxId.replace(/\D/g, "") || (doc.seller.name.en || doc.seller.name.th || "?").toLowerCase();
    const e = by.get(k) ?? { supplier: doc.seller.name.en || doc.seller.name.th || doc.seller.name.ja || "?", taxId: doc.seller.taxId, thisMonth: 0, lastMonth: 0, documents: 0, unpaid: 0 };
    if (mk === month) {
      e.thisMonth = r2(e.thisMonth + doc.totals.net);
      e.documents += 1;
    }
    if (mk === prev) e.lastMonth = r2(e.lastMonth + doc.totals.net);
    if (isUnpaid(doc)) e.unpaid = r2(e.unpaid + doc.totals.net);
    by.set(k, e);
  }
  const list = [...by.values()].filter((e) => e.thisMonth || e.lastMonth || e.unpaid).sort((a, b) => b.thisMonth - a.thisMonth || b.unpaid - a.unpaid);
  return {
    month,
    previousMonth: prev,
    suppliers: list.slice(0, 40).map((e) => ({ ...e, change: e.lastMonth ? `${Math.round(((e.thisMonth - e.lastMonth) / e.lastMonth) * 100)}%` : null })),
    note: "Totals include VAT (what was paid). 'unpaid' is across all months.",
  };
}

/** The card's text for the owner's LINE: title, a blank subtitle, the lines, the app link last (lib/line-dash noticeBubble) */
export function lineCardText(title: unknown, lines: unknown, appUrl: string): { text: string; count: number } | null {
  const clean = (v: unknown, n: number) => String(v ?? "").split(LANG_SPLIT).join("").replace(/\r/g, "").trim().slice(0, n);
  const list = (Array.isArray(lines) ? lines : String(lines ?? "").split("\n")).map((l) => clean(l, 120)).filter((l) => l && !/^https?:\/\//.test(l)).slice(0, 12);
  if (!list.length) return null;
  return { text: [clean(title, 40) || "Grok Bot", "", ...list, `${appUrl}/`].join("\n"), count: list.length };
}

/** A short card to the LINE of the owner who connected the agent, at most 10 a day */
export async function lineToOwner(admin: Admin, who: { id: string; createdBy: string | null }, a: Record<string, unknown>, appUrl: string) {
  if (!who.createdBy) return { sent: false, reason: "This connection has no owner." };
  const { data: m } = await admin.from("members").select("line_user_id, owner, disabled_at").eq("user_id", who.createdBy).maybeSingle();
  if (!m?.owner || m.disabled_at) return { sent: false, reason: "The connecting owner is no longer an owner." };
  if (!m.line_user_id) return { sent: false, reason: "The owner has not linked LINE (Settings → LINE)." };
  const card = lineCardText(a.title, a.lines, appUrl);
  if (!card) return { sent: false, reason: "Nothing to send." };
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from("bot_line_sends").select("id", { count: "exact", head: true }).eq("key_id", who.id).gte("sent_at", since);
  if ((count ?? 0) >= 10) return { sent: false, reason: "Already 10 LINE messages in the last 24 hours." };
  const lang = await lineClient()
    .getProfile(m.line_user_id as string)
    .then((p) => lineLang(p.language))
    .catch(() => "ko" as const);
  await lineClient().pushMessage({ to: m.line_user_id as string, messages: [noticeMessage([card.text], "Grok Bot", lang)] });
  await admin.from("bot_line_sends").insert({ key_id: who.id });
  return { sent: true, to: "the owner's LINE", lines: card.count };
}

/** Receipts that look wrong among those saved in the last `days` days (lib/anomalies: same twice, far above usual, new supplier) */
export async function unusualThings(admin: Admin, days: number, appUrl: string, today: string) {
  const books = await ledger(admin);
  const from = shiftDay(today, -Math.max(1, Math.min(days, 60)));
  const odd = findAnomalies(books.saved, from, today);
  const name = (v: { en: string; th: string; ja: string }) => v.en || v.th || v.ja || "?";
  return {
    from,
    to: today,
    found: odd.length,
    items: odd.map((a) =>
      a.kind === "dup"
        ? { kind: "same receipt twice", supplier: name(a.vendor), docNo: a.docNo, amount: a.amount, open: `${appUrl}/documents/${a.id}`, earlier: `${appUrl}/documents/${a.otherId}` }
        : a.kind === "big"
          ? { kind: "far above the usual", supplier: name(a.vendor), category: a.category, amount: a.amount, usual: a.usual, open: `${appUrl}/documents/${a.id}` }
          : { kind: "new supplier", supplier: name(a.vendor), taxId: a.taxId, taxIdValid: a.taxIdValid, amount: a.amount, open: `${appUrl}/documents/${a.id}` },
    ),
  };
}

/** Sales by day and channel between two dates (closing reports; several a day are summed) */
export async function salesDetail(admin: Admin, from: string, to: string) {
  const rows = await allSales(admin, from, to);
  const days = new Map<string, { date: string; gross: number; withoutVat: number; bills: number; byChannel: Record<string, number> }>();
  for (const s of rows) {
    const d = days.get(s.date) ?? { date: s.date, gross: 0, withoutVat: 0, bills: 0, byChannel: {} };
    d.gross = r2(d.gross + s.gross);
    d.withoutVat = r2(d.withoutVat + saleValue(s));
    d.bills += s.bills;
    d.byChannel[s.channel] = r2((d.byChannel[s.channel] ?? 0) + s.gross);
    days.set(s.date, d);
  }
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { from, to, days: list.length, totalGross: r2(list.reduce((a, d) => a + d.gross, 0)), totalWithoutVat: r2(list.reduce((a, d) => a + d.withoutVat, 0)), byDay: list.slice(0, 62) };
}

/** The tools, for one request */
export function botTools(admin: Admin, appUrl: string, today = todayBangkok(), who: { id: string; createdBy: string | null } = { id: "", createdBy: null }): McpTool[] {
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
      name: "find_documents",
      description: "Search the ledger's documents (receipts, tax invoices): by words (supplier name, document number, tax ID, memo), dates, amount, unpaid only, or drafts. Gives each one's date, supplier, total, VAT, paid or not, and a link.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Words to find, e.g. PANFOOD" },
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
          min_baht: { type: "number" },
          max_baht: { type: "number" },
          unpaid_only: { type: "boolean" },
          drafts: { type: "boolean", description: "Search the drafts waiting to be checked instead" },
          limit: { type: "integer", description: "1–50, default 20" },
        },
        additionalProperties: false,
      },
      run: (a) => findDocuments(admin, a, appUrl),
    },
    {
      name: "supplier_summary",
      description: "Each supplier's total this month against last month (with the change in %), number of documents and what is still unpaid, biggest first.",
      inputSchema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM; default this month" } }, additionalProperties: false },
      run: (a) => {
        const m = typeof a.month === "string" && a.month ? a.month : today.slice(0, 7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new Error("month must be YYYY-MM");
        return supplierSummary(admin, m);
      },
    },
    {
      name: "send_line_to_owner",
      description:
        "Send a short card to the LINE of the owner who connected you: a title and up to 12 lines ('Label: value' lines show as rows). Use it for the daily wrap-up or something urgent, at most 10 a day. It goes to that owner only, never to staff.",
      writes: true,
      inputSchema: {
        type: "object",
        properties: { title: { type: "string", description: "Up to 40 characters" }, lines: { type: "array", items: { type: "string" }, description: "Up to 12 lines of up to 120 characters" } },
        required: ["title", "lines"],
        additionalProperties: false,
      },
      run: (a) => lineToOwner(admin, who, a, appUrl),
    },
    {
      name: "add_receipt",
      description:
        "Put a receipt or tax invoice into the ledger as a DRAFT for a person to check (read by the app's AI like a photo upload; nothing counts until a person saves it). Send a JPEG/PNG/WebP picture as base64; for a PDF e-tax invoice send each page as a picture. The same receipt twice is refused.",
      writes: true,
      inputSchema: {
        type: "object",
        properties: { image_base64: { type: "string", description: "The picture, base64 (up to about 3 MB)" }, note: { type: "string", description: "Optional, e.g. 'from the PANFOOD email of 8 Nov'" } },
        required: ["image_base64"],
        additionalProperties: false,
      },
      run: async (a) => {
        if (!who.createdBy) throw new Error("This connection has no owner.");
        const file = fromBase64(String(a.image_base64));
        if (!file) throw new Error("image_base64 is not base64");
        return addDocumentFromFile(admin, who.createdBy, file, String(a.note ?? ""), appUrl);
      },
    },
    {
      name: "unusual_things",
      description: "Receipts saved in the last days that look wrong: the same receipt twice, a spend far above the usual of its category (3× and ≥ ฿5,000), a new supplier (with its tax ID check). Use it before the wrap-up or when the owner asks what is odd.",
      inputSchema: { type: "object", properties: { days: { type: "integer", description: "1–60, default 7" } }, additionalProperties: false },
      run: (a) => unusualThings(admin, Number(a.days) || 7, appUrl, today),
    },
    {
      name: "price_rises",
      description: "Items bought dearer in a month than the time before (≥ 5 %), per supplier and item, biggest rise first.",
      inputSchema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM; default this month" } }, additionalProperties: false },
      run: async (a) => {
        const m = typeof a.month === "string" && a.month ? a.month : today.slice(0, 7);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new Error("month must be YYYY-MM");
        const books = await ledger(admin);
        const rises = priceRises(books.saved.map((d) => d.doc), m).slice(0, 30);
        return { month: m, found: rises.length, items: rises.map((r) => ({ supplier: r.vendorName.en || r.vendorName.th || r.vendorName.ja, item: r.item, unit: r.unit, before: r.before / 100, now: r.now / 100, risePct: r.pct, date: r.date, beforeDate: r.beforeDate, open: `${appUrl}/documents/${r.docId}` })) };
      },
    },
    {
      name: "sales_detail",
      description: "Sales by day and by channel (store, grab, lineman, foodpanda, shopee, robinhood, other) between two dates, with and without VAT and the number of bills. Up to 62 days.",
      inputSchema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD; default today" } }, required: ["from"], additionalProperties: false },
      run: (a) => {
        const from = dateArg(a.from, "");
        const to = dateArg(a.to, today);
        if (to < from) throw new Error("to is before from");
        return salesDetail(admin, from, to);
      },
    },
    {
      name: "add_document_note",
      description: "Add a short note to a saved document (receipt / tax invoice), e.g. 'checked with the supplier' or 'ask the accountant'. The note is marked as yours; nothing else on the document changes. Not possible in a closed tax month.",
      writes: true,
      inputSchema: { type: "object", properties: { id: { type: "string", description: "The document id (from find_documents)" }, note: { type: "string", description: "Up to 200 characters" } }, required: ["id", "note"], additionalProperties: false },
      run: async (a) => {
        const id = String(a.id);
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("id is not a document id");
        const note = String(a.note).trim().slice(0, 200);
        if (!note) throw new Error("note is empty");
        const { data: d } = await admin.from("documents").select("id, memo, status").eq("id", id).is("deleted_at", null).maybeSingle();
        if (!d) return { added: false, reason: "No such document." };
        const memo = [d.memo as string | null, `Grok Bot: ${note}`].filter(Boolean).join("\n").slice(0, 2000);
        const { error } = await admin.from("documents").update({ memo }).eq("id", id);
        if (error) return { added: false, reason: /month_locked/.test(error.message) ? "That tax month is closed." : error.message };
        return { added: true, id, open: `${appUrl}/documents/${id}` };
      },
    },
    {
      name: "set_event_webhook",
      description:
        "Register the webhook of one of YOUR routines (one started 'when a webhook is triggered') so the books can send you events the moment they happen: a new staff expense claim, a saved receipt worth a look. Pass the routine's webhook URL (https) and its key; the books will call it with 'Authorization: Bearer <key>'. A test event is sent at once. Call this right after you created such a routine.",
      writes: true,
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "The routine's webhook URL (https://…)" }, key: { type: "string", description: "The routine's webhook key" }, name: { type: "string", description: "Optional label, e.g. the routine's name" } },
        required: ["url", "key"],
        additionalProperties: false,
      },
      run: async (a) => {
        if (!who.createdBy) throw new Error("This connection has no owner.");
        const url = String(a.url).trim();
        const key = String(a.key).trim();
        let u: URL;
        try {
          u = new URL(url);
        } catch {
          throw new Error("url is not a URL");
        }
        if (u.protocol !== "https:" || url.length > 500) throw new Error("url must start with https://");
        if (key.length < 8 || key.length > 300 || /\s/.test(key)) throw new Error("key is missing or too short");
        const name = String(a.name ?? "Grok Bot routine").trim().slice(0, 60) || "Grok Bot routine";
        // The same URL again replaces the old row; otherwise at most 3
        await admin.from("bot_webhooks").delete().eq("url", url);
        const { count } = await admin.from("bot_webhooks").select("id", { count: "exact", head: true });
        if ((count ?? 0) >= 3) throw new Error("Already 3 webhooks. The owner removes one in Settings → Grok Bot.");
        const { error } = await admin.from("bot_webhooks").insert({ name, url, key, created_by: who.createdBy });
        if (error) throw new Error(error.message);
        const sent = await sendBotEvent(admin, testEvent(appUrl));
        return { registered: true, host: u.host, testDelivered: sent > 0, note: sent > 0 ? "The test event reached your routine. From now on claims and receipts worth a look arrive the same way." : "Registered, but the test event was not accepted by that URL. Check the URL and key; the owner sees the status in Settings → Grok Bot." };
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
    "Sawadee TAX: the books of a restaurant company in Thailand (receipts, sales, tax calendar). You may read summaries, search documents, spot unusual receipts and price rises, see sales by day, put dates in the calendar, add notes to documents, add receipts as drafts for a person to check, and send short cards to the connecting owner's LINE. You cannot change saved documents, pay, approve or message staff. For the daily wrap-up call day_summary. Amounts are Thai baht. Dates are Bangkok time.",
};

