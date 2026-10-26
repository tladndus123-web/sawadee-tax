// The 5-day LINE report (owner, 2026-10-26; it replaced the Monday report): on the 5th, 10th, 15th, 20th and 25th the
// daily cron (09:00 Bangkok) sends each linked admin four cards to swipe, in their phone's LINE language —
// ① the last 5 days ② the month so far and where it ends ③ ✨ three suggestions Claude writes from the numbers
// ④ 🔍 anything unusual (lib/anomalies.ts).

import Anthropic from "@anthropic-ai/sdk";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";
import { monthExpenses, rowToClaim } from "./expenses";
import { type Anomaly, findAnomalies } from "./anomalies";
import { monthKey } from "./archive";
import { serverCategories } from "./categories-server";
import { summarize } from "./dashboard";
import { foodCostPct, keepsSales, lastDay, ledger, salesOf, salesTarget, shiftDay, shiftMonth, sumOf, type Admin } from "./line-ask-server";
import { type AnomalyLine, fiveDayMessage, type FiveDayData, nameIn, type Tip } from "./line-dash";
import { lineClient } from "./line";
import type { LineLang } from "./line-lang";
import { profileLang } from "./line-menu";
import { forecastTip, marginTip, NEXT } from "./line-tips";
import { monthBooks } from "./month-end-server";
import { monthEndMessage } from "./line-dash";
// Cards show whole baht (the exact figure is one tap away in the app)
import { bahtWhole as baht } from "./money";
import { priceRises } from "./price-watch";
import { nextWorkingDay } from "./thai-holidays";

const CATEGORY = { ja: ja.category, th: th.category, en: en.category, ko: ko.category } as const;

/** First day a report may go out (owner 2026-10-26: "not today") */
export const REPORTS_FROM = "2026-10-27";
/** Days of the month the report goes out */
export const REPORT_DAYS = [5, 10, 15, 20, 25];

/** Bangkok date "YYYY-MM-DD" */
export const isReportDay = (today: string) => today >= REPORTS_FROM && REPORT_DAYS.includes(Number(today.slice(8, 10)));

/** The 1st of a month: last month's month-end report */
export const isMonthEndDay = (today: string) => today >= REPORTS_FROM && today.endsWith("-01");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The numbers of the report, the unusual things, and the facts the AI may use */
export async function reportData(admin: Admin, today: string): Promise<{ data: FiveDayData; odd: Anomaly[]; facts: string; taxId: string } | null> {
  const to = shiftDay(today, -1);
  const from = shiftDay(today, -5);
  const month = to.slice(0, 7);
  const lastMonth = shiftMonth(month, -1);
  const [{ saved, taxId, company }, hasSales, target, branches] = await Promise.all([ledger(admin), keepsSales(admin), salesTarget(admin, month), admin.from("branches").select("id")]);
  if (!saved.length && !hasSales) return null;
  const [days, before, monthRows, lastMonthRows, recent] = await Promise.all([
    salesOf(admin, from, to),
    salesOf(admin, shiftDay(from, -5), shiftDay(from, -1)),
    salesOf(admin, `${month}-01`, to),
    salesOf(admin, `${lastMonth}-01`, lastDay(lastMonth)),
    salesOf(admin, shiftDay(to, -27), to),
  ]);
  const docs = saved.map((d) => d.doc);
  const came = saved.filter((d) => d.created >= from && d.created <= to);
  const s = summarize(saved, month, taxId, today);
  const food = await foodCostPct(admin, docs, month, taxId);
  const byDay = new Map<string, number>();
  for (const r of days) byDay.set(r.sale_date as string, (byDay.get(r.sale_date as string) ?? 0) + Number(r.gross));
  const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const data: FiveDayData = {
    from,
    to,
    company,
    branchCount: (branches.data ?? []).length,
    hasSales,
    sales: sumOf(days, "gross"),
    salesBefore: sumOf(before, "gross"),
    bestDay: best ? { date: best[0], gross: Math.round(best[1] * 100) / 100 } : null,
    receipts: came.length,
    purchases: Math.round(came.reduce((a, d) => a + d.doc.totals.net * 100, 0)) / 100,
    month,
    monthSales: sumOf(monthRows, "gross"),
    monthSalesValue: Math.round((sumOf(monthRows, "gross") - sumOf(monthRows, "vat")) * 100) / 100,
    target,
    lastMonthSales: sumOf(lastMonthRows, "gross"),
    monthPurchases: s.total,
    foodCost: food,
    vatEstimate: Math.max(0, Math.round((sumOf(monthRows, "vat") - s.claimableVat) * 100) / 100),
    vatDue: nextWorkingDay(`${shiftMonth(month, 1)}-15`),
  };
  const odd = findAnomalies(saved, from, to);

  // Context for the suggestions: weekday averages over 4 weeks, price rises, what was unusual
  const wd = new Map<number, { sum: number; days: Set<string> }>();
  for (const r of recent) {
    const d = new Date(`${r.sale_date}T00:00:00Z`).getUTCDay();
    const a = wd.get(d) ?? { sum: 0, days: new Set<string>() };
    a.sum += Number(r.gross) || 0;
    a.days.add(r.sale_date as string);
    wd.set(d, a);
  }
  const rises = priceRises(docs, month)
    .slice(0, 5)
    .map((r) => `${r.item} (${r.vendorName.en || r.vendorName.th}) +${r.pct}%`);
  const facts = [
    `Business: restaurants in Thailand (${data.branchCount} branch(es)). Amounts in THB.`,
    `Month ${month}, up to ${to} (day ${Number(to.slice(8, 10))} of ${Number(lastDay(month).slice(8, 10))}). Sales so far ${data.monthSales}; last month in total ${data.lastMonthSales}${target ? `; monthly target ${target}` : "; no target set"}.`,
    `Last 5 days (${from}–${to}): sales ${data.sales}, the 5 days before ${data.salesBefore}; ${data.receipts} receipts came in for ${data.purchases}.`,
    `Average sales by weekday (last 4 weeks): ${[...wd.entries()].sort((a, b) => a[0] - b[0]).map(([d, a]) => `${WEEKDAYS[d]} ${Math.round(a.sum / a.days.size)}`).join(", ") || "no data"}.`,
    `Food cost this month: ${food ?? "unknown"}%. Purchases this month ${s.total}; unpaid bills ${s.unpaid} (${s.unpaidCount}, ${s.overdueCount} overdue); receipts with warnings ${s.toCheck}.`,
    `Price rises this month: ${rises.join("; ") || "none"}.`,
    `Unusual in the last 5 days: ${odd.map((a) => (a.kind === "dup" ? `receipt ${a.docNo} saved twice` : a.kind === "big" ? `spend ${a.amount} in ${a.category}, usual ${a.usual}` : `new supplier ${a.vendor.en || a.vendor.th}`)).join("; ") || "nothing"}.`,
    `Receipts this month: ${saved.filter((d) => monthKey(d.doc) === month).length}.`,
  ].join("\n");
  return { data, odd, facts, taxId };
}

const LANG_NAME: Record<LineLang, string> = { ko: "Korean", ja: "Japanese", th: "Thai", en: "English" };
let client: Anthropic | null = null;

/** Three short, practical suggestions for the month from the numbers (none when the AI is not available) */
export async function reportTips(facts: string, lang: LineLang): Promise<Tip[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    client ??= new Anthropic({ maxRetries: 1 });
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1200,
      output_config: { effort: "low" },
      system:
        "You are the bookkeeping assistant of a small restaurant company in Thailand. From these numbers, give the owner exactly three short, practical suggestions for running the business for the rest of this month. Use only the numbers given; never invent figures. Each: a title (one sentence, at most 40 characters) and a body (at most 90 characters) with a concrete action. Reply only with JSON: {\"tips\":[{\"title\":\"\",\"body\":\"\"}]}",
      messages: [{ role: "user", content: `${facts}\n\nWrite the suggestions in ${LANG_NAME[lang]}.` }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { tips?: { title?: unknown; body?: unknown }[] };
    return (parsed.tips ?? [])
      .filter((t) => typeof t.title === "string" && typeof t.body === "string")
      .slice(0, 3)
      .map((t) => ({ title: String(t.title).slice(0, 80), body: String(t.body).slice(0, 200) }));
  } catch (e) {
    console.warn("[report] tips failed", e instanceof Error ? e.message : e);
    return [];
  }
}

/** The unusual things in the reader's words, each linked to its document */
export function anomalyLines(odd: Anomaly[], lang: LineLang, appUrl: string, categoryName: (k: string) => string): AnomalyLine[] {
  return odd.map((a) => {
    const vendor = nameIn(a.vendor, lang);
    const url = `${appUrl}/documents/${a.id}`;
    if (a.kind === "dup")
      return {
        level: "red",
        title: { ko: "같은 영수증이 두 번 올라왔어요", ja: "同じ領収書が2回登録されています", th: "ใบเสร็จเดียวกันถูกบันทึก 2 ครั้ง", en: "The same receipt was saved twice" }[lang],
        detail: `${vendor} · ${a.docNo} · ${baht(a.amount)}`,
        url,
      };
    if (a.kind === "big") {
      const x = Math.round((a.amount / a.usual) * 10) / 10;
      const cat = categoryName(a.category);
      return {
        level: "orange",
        title: { ko: `평소보다 ${x}배 큰 지출 ${baht(a.amount)}`, ja: `いつもの${x}倍の支出 ${baht(a.amount)}`, th: `ค่าใช้จ่ายสูงกว่าปกติ ${x} เท่า ${baht(a.amount)}`, en: `${x}× the usual spend: ${baht(a.amount)}` }[lang],
        detail: { ko: `${cat} 평균 ${baht(a.usual)} · ${vendor}`, ja: `${cat}の平均 ${baht(a.usual)} · ${vendor}`, th: `${cat} เฉลี่ย ${baht(a.usual)} · ${vendor}`, en: `${cat} usually ${baht(a.usual)} · ${vendor}` }[lang],
        url,
      };
    }
    return {
      level: a.taxIdValid ? "blue" : "orange",
      title: { ko: "처음 보는 거래처", ja: "初めての取引先", th: "ผู้ขายรายใหม่", en: "A new supplier" }[lang],
      detail: `${vendor} · ${
        a.taxIdValid
          ? { ko: "세금번호 확인됨", ja: "税番号OK", th: "เลขผู้เสียภาษีถูกต้อง", en: "tax ID valid" }[lang]
          : { ko: "세금번호 확인 필요", ja: "税番号を要確認", th: "ตรวจเลขผู้เสียภาษี", en: "check the tax ID" }[lang]
      } · ${baht(a.amount)}`,
      url,
    };
  });
}

/** Push the report to every linked admin, each in their LINE language. Returns how many got it. */
export async function sendReport(admin: Admin, appUrl: string, today: string, to: string[]): Promise<number> {
  if (!to.length) return 0;
  const made = await reportData(admin, today);
  if (!made) return 0;
  const cats = await serverCategories();
  const tips = new Map<LineLang, Tip[]>();
  let sent = 0;
  for (const id of to) {
    const lang = await profileLang(id);
    if (!tips.has(lang)) tips.set(lang, await reportTips(made.facts, lang));
    const categoryName = (k: string) => {
      const c = cats.find((x) => x.key === k);
      return (lang === "th" ? c?.name?.th : lang === "ja" ? c?.name?.ja : c?.name?.en) || (ja.category as Record<string, string>)[k] || k;
    };
    const d = made.data;
    const tip = d.hasSales
      ? forecastTip({ sales: d.monthSales, salesValue: d.monthSalesValue, daysDone: Number(d.to.slice(8, 10)), daysInMonth: Number(lastDay(d.month).slice(8, 10)), target: d.target, lastMonthSales: d.lastMonthSales, month: d.month }, lang)
      : null;
    try {
      await lineClient().pushMessage({
        to: id,
        messages: [fiveDayMessage(d, tips.get(lang)!, anomalyLines(made.odd, lang, appUrl, categoryName), lang, appUrl, { tip, next: NEXT.weekly[lang] })],
      });
      sent += 1;
    } catch (e) {
      console.error("[report] push failed", e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

/** The month-end report (the 1st): last month's result, files, the accountant link and next month's target */
export async function sendMonthEnd(admin: Admin, appUrl: string, today: string, to: string[]): Promise<number> {
  if (!to.length) return 0;
  const month = shiftMonth(today.slice(0, 7), -1);
  const b = await monthBooks(admin, month);
  if (!b.documents && !b.hasSales) return 0;
  const r = b.result;
  const [claims, cats] = await Promise.all([admin.from("expense_claims").select("*"), admin.from("categories").select("key, name")]);
  const ex = monthExpenses((claims.data ?? []).map((c) => rowToClaim(c as Record<string, unknown>)), month);
  const catName = (key: string, lang: LineLang) =>
    ((cats.data ?? []).find((c) => c.key === key)?.name as Record<string, string> | undefined)?.[lang]?.trim() || (CATEGORY[lang] as Record<string, string>)[key] || key;
  let sent = 0;
  for (const id of to) {
    const lang = await profileLang(id);
    const tip = marginTip({ salesValue: r.salesValue, profit: r.profit, prevSalesValue: b.previous.salesValue, prevProfit: b.previous.profit }, lang);
    try {
      await lineClient().pushMessage({
        to: id,
        messages: [
          monthEndMessage(
            {
              month,
              company: b.company,
              hasSales: b.hasSales,
              salesValue: r.salesValue,
              costs: r.purchasesCost,
              labor: r.labor,
              profit: r.profit,
              previousProfit: b.previous.profit,
              vatPayable: r.vatPayable,
              wht: Math.round((b.whtSuppliers + b.whtPayroll) * 100) / 100,
              socialSecurity: b.socialSecurity,
              target: b.target,
              documents: b.documents,
              expenses: { ...ex, categories: ex.categories.map((c) => ({ name: catName(c.category, lang), amount: c.amount })) },
            },
            lang,
            appUrl,
            { tip, next: NEXT.summary[lang] },
          ),
        ],
      });
      sent += 1;
    } catch (e) {
      console.error("[month-end] push failed", e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
