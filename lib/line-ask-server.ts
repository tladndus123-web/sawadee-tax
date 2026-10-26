// Server part of "ask the bot" (lib/line-ask.ts): the same numbers as the dashboard, read with the service-role
// client for an admin who tapped a menu button or typed a short word in LINE.

import crypto from "node:crypto";
import ja from "@/messages/ja.json";
import { monthKey } from "./archive";
import { serverCategories } from "./categories-server";
import { daysUntil, summarize, upcoming, vatFiling } from "./dashboard";
import { type DocumentRow, type ItemRow, rowToDoc } from "./db-map";
import { buildMonthExport } from "./export";
import { buildMonthXlsx, XLSX_TYPE, type XlsxLabels } from "./export-xlsx";
import { lineBranchLabel } from "./line";
import { type Ask, dueText, EXCEL_LINK_SECONDS, excelText, salesText, summaryText, vatText } from "./line-ask";
import { flagsFor } from "./checks";
import type { supabaseAdmin } from "./supabase/admin";
import { todayBangkok } from "./thai-tax";
import type { LedgerDoc } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = DocumentRow & { document_items: ItemRow[]; ack_flags?: string[] | null };

const shiftDay = (d: string, by: number) => new Date(Date.parse(`${d}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const sum = (rows: { [k: string]: unknown }[], k: string) => rows.reduce((a, r) => a + Math.round(Number(r[k] ?? 0) * 100), 0) / 100;

async function ledger(admin: Admin) {
  // Which categories' VAT is not claimable (settings) — claimable VAT depends on it
  await serverCategories();
  const [docs, settings] = await Promise.all([
    admin.from("documents").select("*, document_items(*)").is("deleted_at", null),
    admin.from("company_settings").select("tax_id").eq("id", 1).maybeSingle(),
  ]);
  if (docs.error || settings.error) throw docs.error ?? settings.error;
  const rows = (docs.data ?? []) as Row[];
  const toDoc = (r: Row) => ({ id: r.id, doc: rowToDoc(r, r.document_items ?? []), ack: r.ack_flags ?? [] });
  return {
    // Drafts never count in totals
    saved: rows.filter((r) => r.status === "reviewed").map(toDoc),
    drafts: rows.filter((r) => r.status === "draft").map(toDoc),
    taxId: (settings.data?.tax_id as string | undefined) ?? "",
  };
}

async function salesOf(admin: Admin, from: string, to: string) {
  const { data, error } = await admin.from("sales").select("branch_id, gross, vat, bills").gte("sale_date", from).lte("sale_date", to);
  if (error) throw error;
  return data ?? [];
}

/** Does the company keep its sales here at all? (otherwise the answers leave sales out) */
async function keepsSales(admin: Admin) {
  const { count } = await admin.from("sales").select("id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

const vendorName = (d: LedgerDoc) => ({
  th: d.seller.name.th || d.seller.name.en || d.seller.name.ja,
  ja: d.seller.name.ja || d.seller.name.en || d.seller.name.th,
});

/** The text that answers one button / word (a link to the right screen at the end) */
export async function askAnswer(admin: Admin, ask: Ask, appUrl: string, today = todayBangkok()): Promise<string> {
  const month = today.slice(0, 7);
  if (ask === "summary") {
    const [{ saved, taxId }, hasSales] = await Promise.all([ledger(admin), keepsSales(admin)]);
    const s = summarize(saved, month, taxId, today);
    const sales = hasSales ? sum(await salesOf(admin, `${month}-01`, `${month}-31`), "gross") : null;
    return summaryText({ month, ...s, sales }, `${appUrl}/`);
  }
  if (ask === "due") {
    const { saved } = await ledger(admin);
    const bills = upcoming(saved, today)
      .filter((d) => d.state === "overdue" || d.state === "soon")
      .map((d) => ({ ...vendorName(d.doc), amount: d.doc.totals.net, due: d.doc.dueDate, days: daysUntil(d.doc.dueDate, today) }))
      .map(({ th, ja, ...b }) => ({ ...b, vendorTh: th, vendorJa: ja }));
    return dueText(bills, `${appUrl}/ledger`);
  }
  if (ask === "vat") {
    const f = vatFiling(today);
    const [{ saved, drafts, taxId }, hasSales] = await Promise.all([ledger(admin), keepsSales(admin)]);
    const s = summarize(saved, f.month, taxId, today);
    const salesVat = hasSales ? sum(await salesOf(admin, `${f.month}-01`, `${f.month}-31`), "vat") : null;
    return vatText(
      {
        month: f.month,
        due: f.onlineOnly ? f.dueOnline : f.due,
        daysLeft: f.daysLeft,
        onlineOnly: f.onlineOnly,
        claimableVat: s.claimableVat,
        salesVat,
        toCheck: s.toCheck,
        drafts: drafts.filter((d) => monthKey(d.doc) === f.month).length,
      },
      `${appUrl}/ledger/report/${f.month}`,
    );
  }
  if (ask === "sales") {
    const day = shiftDay(today, -1);
    const [rows, branches] = await Promise.all([salesOf(admin, day, day), admin.from("branches").select("id, no, name, sort").order("sort")]);
    const list = (branches.data ?? []) as { id: string; no: string; name: string }[];
    const by = new Map<string, { gross: number; bills: number }>();
    for (const r of rows) {
      const k = (r.branch_id as string | null) ?? "";
      const a = by.get(k) ?? { gross: 0, bills: 0 };
      a.gross += Math.round(Number(r.gross) * 100);
      a.bills += Number(r.bills) || 0;
      by.set(k, a);
    }
    const order = (k: string) => {
      const i = list.findIndex((b) => b.id === k);
      return i < 0 ? -1 : i;
    };
    return salesText(
      {
        date: day,
        branches: [...by.entries()]
          .sort((a, b) => order(a[0]) - order(b[0]))
          .map(([k, v]) => {
            const b = list.find((x) => x.id === k) ?? { no: "00000", name: "" };
            return { th: lineBranchLabel(b, "th"), ja: lineBranchLabel(b, "ja"), gross: v.gross / 100, bills: v.bills };
          }),
      },
      `${appUrl}/sales`,
    );
  }
  return excelAnswer(admin, today);
}

// ── Excel: the month's purchase ledger (the app's "Excel" export, Japanese with the Thai names), as a download link
// that works for an hour. LINE bots cannot send files, only links.

const EXPORT_COLS = [
  "date", "docNo", "vendor", "vendorTh", "taxId", "branch", "docType", "category", "items", "taxable", "exempt",
  "vat", "net", "wht", "paid", "paidDate", "claimable", "flags", "line", "code", "descTh", "desc", "qty", "unit", "price", "amount",
] as const;
const BUCKET = "line-exports";

async function excelAnswer(admin: Admin, today: string): Promise<string> {
  const { saved, taxId } = await ledger(admin);
  const cats = await serverCategories();
  const L = ja.export as Record<string, string>;
  const labels: XlsxLabels = {
    sheetLedger: L.sheetLedger,
    sheetItems: L.sheetItems,
    cols: Object.fromEntries(EXPORT_COLS.map((k) => [k, L[k]])),
    total: L.total,
    yes: L.yes,
    no: L.no,
    docType: (k) => (ja.docType as Record<string, string>)[k] ?? k,
    category: (k) => {
      const c = cats.find((x) => x.key === k);
      return c?.name?.ja?.trim() || (ja.category as Record<string, string>)[k] || Object.values(c?.name ?? {}).find((v) => v?.trim()) || k;
    },
    sheetCosts: L.sheetCosts,
    cost: L.cost,
  };
  // Earlier links' files are not kept
  const old = await admin.storage.from(BUCKET).list("", { limit: 100 });
  if (old.data?.length) await admin.storage.from(BUCKET).remove(old.data.map((f) => f.name));

  // This month; in the first half of a month also last month (the one the accountant is working on)
  const month = today.slice(0, 7);
  const wanted = Number(today.slice(8, 10)) <= 15 ? [shiftMonth(month, -1), month] : [month];
  // A month without documents is left out (unless every one is empty: then this month's empty file)
  const months = wanted.filter((m) => saved.some((d) => monthKey(d.doc) === m));
  const files = [];
  for (const m of months.length ? months : [month]) {
    const docs = saved.filter((d) => monthKey(d.doc) === m);
    const data = buildMonthExport(
      docs.map((d) => ({ doc: d.doc, flags: flagsFor(d.doc, { companyTaxId: taxId }).filter((f) => f !== "unclear").length })),
      "ja",
      taxId,
    );
    const buf = await buildMonthXlsx(data, true, labels);
    const path = `${crypto.randomUUID()}.xlsx`;
    const up = await admin.storage.from(BUCKET).upload(path, Buffer.from(buf), { contentType: XLSX_TYPE });
    if (up.error) throw up.error;
    const signed = await admin.storage.from(BUCKET).createSignedUrl(path, EXCEL_LINK_SECONDS, { download: `purchase-ledger-${m}.xlsx` });
    if (signed.error || !signed.data) throw signed.error ?? new Error("no signed url");
    files.push({ month: m, count: docs.length, url: signed.data.signedUrl });
  }
  return excelText(files);
}
