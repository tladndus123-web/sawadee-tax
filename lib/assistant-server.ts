// Server part of the LINE AI assistant (lib/assistant.ts): a compact picture of the company's books for the model,
// the recent conversation, the monthly limit of the long analyses, and the answer.

import Anthropic from "@anthropic-ai/sdk";
import { isUnpaid, monthKey } from "./archive";
import {
  DEEP_MARK,
  DEEP_MODEL,
  DEEP_PER_MONTH,
  deepSystem,
  HISTORY_HOURS,
  HISTORY_TURNS,
  QUICK_MODEL,
  quickSystem,
  wantsDeep,
  chatText,
} from "./assistant";
import { serverCategories } from "./categories-server";
import { monthCosts } from "./cost-split";
import { summarize, vatFiling } from "./dashboard";
import { foodCostPct, ledger, salesOf, shiftDay, shiftMonth, sumOf, type Admin } from "./line-ask-server";
import { priceRises } from "./price-watch";
import { todayBangkok } from "./thai-tax";

const r0 = (n: number) => Math.round(n);

/** The books as short lines of text: last months, recent days, branches, unpaid bills, vendors, price rises, VAT, payroll */
export async function booksContext(admin: Admin, today: string, deep: boolean): Promise<string> {
  const month = today.slice(0, 7);
  const months = Array.from({ length: deep ? 6 : 3 }, (_, i) => shiftMonth(month, -i)).reverse();
  const first = `${months[0]}-01`;
  const [{ saved, taxId, company }, sales, branches, cats, payroll] = await Promise.all([
    ledger(admin),
    salesOf(admin, first, today),
    admin.from("branches").select("id, no, name, sales_target").order("sort"),
    serverCategories(),
    admin.from("payroll_lines").select("month, gross, net, wht, ss_employee, ss_employer").in("month", months),
  ]);
  const docs = saved.map((d) => d.doc);
  const catName = (k: string) => {
    const c = cats.find((x) => x.key === k);
    return c?.name?.en || c?.name?.ja || c?.name?.th || k;
  };
  const branchName = (id: string | null) => {
    const b = (branches.data ?? []).find((x) => x.id === id);
    return b ? (b.name as string) || (b.no === "00000" ? "Head office" : `Branch ${b.no}`) : "Head office";
  };

  const lines: string[] = [`# ${company || "Our company"} — books as of ${today} (Bangkok)`];
  lines.push(`Branches: ${(branches.data ?? []).map((b) => `${branchName(b.id as string)}${Number(b.sales_target) ? ` (monthly target ${r0(Number(b.sales_target))})` : ""}`).join(", ") || "one"}`);

  lines.push("", "## By month (sales gross incl. VAT; purchases = documents' net totals)");
  for (const m of months) {
    const rows = sales.filter((r) => String(r.sale_date).startsWith(m));
    const s = summarize(saved, m, taxId, today);
    const byCat = [...monthCosts(docs, m, taxId).byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, deep ? 10 : 6);
    const food = await foodCostPct(admin, docs, m, taxId);
    const pay = (payroll.data ?? []).filter((p) => p.month === m);
    lines.push(
      `${m}${m === month ? " (so far)" : ""}: sales ${r0(sumOf(rows, "gross"))} (VAT ${r0(sumOf(rows, "vat"))}, ${new Set(rows.map((r) => r.sale_date)).size} days) · purchases ${r0(s.total)} (${s.count} docs) · claimable input VAT ${r0(s.claimableVat)} · food cost ${food ?? "?"}%` +
        (pay.length ? ` · payroll gross ${r0(sumOf(pay, "gross"))}, withholding ${r0(sumOf(pay, "wht"))}, social security ${r0(sumOf(pay, "ss_employee") + sumOf(pay, "ss_employer"))}` : "") +
        (byCat.length ? `\n  costs by category: ${byCat.map(([k, v]) => `${catName(k)} ${r0(v / 100)}`).join(", ")}` : ""),
    );
  }

  const days = deep ? 45 : 14;
  const recent = new Map<string, number>();
  for (const r of sales.filter((x) => String(x.sale_date) >= shiftDay(today, -days))) recent.set(r.sale_date as string, (recent.get(r.sale_date as string) ?? 0) + Number(r.gross));
  if (recent.size) {
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    lines.push("", `## Daily sales, last ${days} days`, [...recent.entries()].sort().map(([d, g]) => `${d.slice(5)} ${wd[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${r0(g)}`).join(" · "));
  }

  const byBranch = new Map<string, number>();
  for (const r of sales.filter((x) => String(x.sale_date).startsWith(month))) {
    const k = branchName(r.branch_id as string | null);
    byBranch.set(k, (byBranch.get(k) ?? 0) + Number(r.gross));
  }
  if (byBranch.size > 1) lines.push("", "## Sales this month by branch", [...byBranch.entries()].map(([k, v]) => `${k} ${r0(v)}`).join(" · "));

  const unpaid = saved
    .filter((d) => isUnpaid(d.doc))
    .sort((a, b) => (a.doc.dueDate || "9999").localeCompare(b.doc.dueDate || "9999"))
    .slice(0, deep ? 30 : 15);
  if (unpaid.length) lines.push("", "## Unpaid bills (soonest due first)", ...unpaid.map((d) => `${d.doc.seller.name.en || d.doc.seller.name.th} ${r0(d.doc.totals.net)} due ${d.doc.dueDate || "—"} (doc ${d.doc.docNo}, ${d.doc.date})`));

  const vendors = new Map<string, number>();
  for (const d of saved.filter((x) => monthKey(x.doc) === month)) {
    const k = d.doc.seller.name.en || d.doc.seller.name.th || "?";
    vendors.set(k, (vendors.get(k) ?? 0) + d.doc.totals.net);
  }
  if (vendors.size) lines.push("", "## Biggest suppliers this month", [...vendors.entries()].sort((a, b) => b[1] - a[1]).slice(0, deep ? 15 : 8).map(([k, v]) => `${k} ${r0(v)}`).join(" · "));

  const rises = priceRises(docs, month).slice(0, deep ? 15 : 8);
  if (rises.length) lines.push("", "## Price rises this month (vs the previous purchase)", ...rises.map((r) => `${r.item} from ${r.vendorName.en || r.vendorName.th}: ${(r.before / 100).toFixed(2)} → ${(r.now / 100).toFixed(2)} per ${r.unit || "unit"} (+${r.pct}%)`));

  const f = vatFiling(today);
  const fs = summarize(saved, f.month, taxId, today);
  const fSales = sales.filter((r) => String(r.sale_date).startsWith(f.month));
  lines.push(
    "",
    "## Filing",
    `VAT return ภ.พ.30 for ${f.month}: due ${f.onlineOnly ? f.dueOnline : f.due} (${f.daysLeft} days), output VAT ${r0(sumOf(fSales, "vat"))}, claimable input VAT ${r0(fs.claimableVat)}, documents with warnings ${fs.toCheck}.`,
    `Payroll / withholding returns (ภ.ง.ด.1, ภ.ง.ด.3/53, สปส.1-10) for last month are due on the 7th (paper) / 15th (online).`,
  );
  return lines.join("\n");
}

let client: Anthropic | null = null;
const reply = (res: Anthropic.Message) => res.content.map((b) => (b.type === "text" ? b.text : "")).join("");

export interface AssistantAnswer {
  text: string;
  model: string;
  /** This month's long analyses so far, when this answer was one */
  deepCount: number | null;
  /** The long analysis was wanted but this month's are used up */
  deepUsedUp: boolean;
}

/**
 * One answer. `onDeep` runs before a long analysis starts (to tell the person it takes a moment).
 * The conversation of the last day goes along so follow-up questions make sense.
 */
export async function answer(admin: Admin, userId: string, question: string, onDeep: (n: number) => Promise<void>, today = todayBangkok()): Promise<AssistantAnswer> {
  client ??= new Anthropic({ maxRetries: 2 });
  const since = new Date(Date.now() - HISTORY_HOURS * 3_600_000).toISOString();
  const { data: turns } = await admin
    .from("assistant_turns")
    .select("role, content")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);
  // Oldest first, starting with a question
  const history = ((turns ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();
  while (history.length && history[0].role !== "user") history.shift();
  const messages: Anthropic.MessageParam[] = [...history.map((t) => ({ role: t.role, content: t.content })), { role: "user", content: question }];

  const quickContext = await booksContext(admin, today, false);
  const quick = await client.messages.create({
    model: QUICK_MODEL,
    max_tokens: 1500,
    system: [{ type: "text", text: quickSystem(quickContext), cache_control: { type: "ephemeral" } }],
    messages,
  });
  let text = reply(quick);
  let model = QUICK_MODEL;
  let deepCount: number | null = null;
  let deepUsedUp = false;

  if (wantsDeep(text)) {
    const { data: n, error } = await admin.rpc("assistant_claim", { p_month: today.slice(0, 7), p_model: DEEP_MODEL, p_limit: DEEP_PER_MONTH });
    if (error) throw error;
    if (Number(n) > 0) {
      deepCount = Number(n);
      await onDeep(deepCount);
      const deep = await client.messages.create({
        model: DEEP_MODEL,
        max_tokens: 6000,
        output_config: { effort: "medium" },
        system: deepSystem(await booksContext(admin, today, true)),
        messages,
      });
      text = reply(deep);
      model = DEEP_MODEL;
    } else {
      // Used up: Haiku answers as well as it can, in short
      deepUsedUp = true;
      const again = await client.messages.create({
        model: QUICK_MODEL,
        max_tokens: 2000,
        system: [{ type: "text", text: quickSystem(quickContext), cache_control: { type: "ephemeral" } }],
        messages: [...messages.slice(0, -1), { role: "user", content: `${question}\n\n(Answer it yourself as well as you can in a short form; do not reply ${DEEP_MARK}.)` }],
      });
      text = reply(again).replace(DEEP_MARK, "");
    }
  }
  text = chatText(text);

  await admin.from("assistant_turns").insert([
    { user_id: userId, role: "user", content: question.slice(0, 8000) },
    { user_id: userId, role: "assistant", content: text.slice(0, 8000), model },
  ]);
  // Count the quick answers too (no limit), so the month's use can be seen
  if (model === QUICK_MODEL) await admin.rpc("assistant_claim", { p_month: today.slice(0, 7), p_model: QUICK_MODEL, p_limit: 1_000_000 });
  // Older than 30 days: gone
  await admin.from("assistant_turns").delete().lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  return { text, model, deepCount, deepUsedUp };
}
