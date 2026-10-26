// The weekly AI assistant report (owner, 2026-10-26): every Monday morning (the daily cron, 09:00 Bangkok) each linked
// admin gets one dashboard card in their phone's LINE language — this month so far, last week's sales, food cost,
// purchases, the VAT estimate, and three short suggestions Claude writes from those numbers.

import Anthropic from "@anthropic-ai/sdk";
import { monthKey } from "./archive";
import { summarize } from "./dashboard";
import { foodCostPct, keepsSales, lastDay, ledger, salesOf, salesTarget, shiftDay, shiftMonth, sumOf, type Admin } from "./line-ask-server";
import { type Tip, weeklyCard, type WeeklyData } from "./line-dash";
import { lineClient } from "./line";
import type { LineLang } from "./line-lang";
import { profileLang } from "./line-menu";
import { priceRises } from "./price-watch";
import { nextWorkingDay } from "./thai-holidays";

/** Mondays (Bangkok date "YYYY-MM-DD") */
export const isReportDay = (today: string) => new Date(`${today}T00:00:00Z`).getUTCDay() === 1;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The numbers of the report, and the facts the AI may use for its suggestions */
export async function weeklyData(admin: Admin, today: string): Promise<{ data: WeeklyData; facts: string } | null> {
  const to = shiftDay(today, -1);
  const from = shiftDay(today, -7);
  const month = to.slice(0, 7);
  const lastMonth = shiftMonth(month, -1);
  const [{ saved, taxId, company }, hasSales, target, branches] = await Promise.all([ledger(admin), keepsSales(admin), salesTarget(admin), admin.from("branches").select("id")]);
  if (!saved.length && !hasSales) return null;
  const [monthRows, lastMonthRows, week, prevWeek, recent] = await Promise.all([
    salesOf(admin, `${month}-01`, to),
    salesOf(admin, `${lastMonth}-01`, lastDay(lastMonth)),
    salesOf(admin, from, to),
    salesOf(admin, shiftDay(from, -7), shiftDay(to, -7)),
    salesOf(admin, shiftDay(to, -27), to),
  ]);
  const docs = saved.map((d) => d.doc);
  const s = summarize(saved, month, taxId, today);
  const [food, foodLast] = await Promise.all([foodCostPct(admin, docs, month, taxId), foodCostPct(admin, docs, lastMonth, taxId)]);
  const data: WeeklyData = {
    from,
    to,
    company,
    branchCount: (branches.data ?? []).length,
    month,
    monthSales: sumOf(monthRows, "gross"),
    target,
    lastMonthSales: sumOf(lastMonthRows, "gross"),
    weekSales: sumOf(week, "gross"),
    prevWeekSales: sumOf(prevWeek, "gross"),
    foodCost: food,
    foodCostLastMonth: foodLast,
    purchases: s.total,
    receipts: saved.filter((d) => monthKey(d.doc) === month).length,
    vatEstimate: Math.max(0, Math.round((sumOf(monthRows, "vat") - s.claimableVat) * 100) / 100),
    vatDue: nextWorkingDay(`${shiftMonth(month, 1)}-15`),
  };

  // Average sales per weekday over the last 4 weeks, and the biggest price rises — context for the suggestions
  const byDay = new Map<number, { sum: number; days: Set<string> }>();
  for (const r of recent) {
    const d = new Date(`${r.sale_date}T00:00:00Z`).getUTCDay();
    const a = byDay.get(d) ?? { sum: 0, days: new Set<string>() };
    a.sum += Number(r.gross) || 0;
    a.days.add(r.sale_date as string);
    byDay.set(d, a);
  }
  const weekdays = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, a]) => `${WEEKDAYS[d]} ${Math.round(a.sum / a.days.size)}`);
  const rises = priceRises(docs, month)
    .slice(0, 5)
    .map((r) => `${r.item} (${r.vendorName.en || r.vendorName.th}) +${r.pct}%`);
  const daysInMonth = Number(lastDay(month).slice(8, 10));
  const daysSoFar = Number(to.slice(8, 10));
  const facts = [
    `Business: restaurants in Thailand (${data.branchCount} branch(es)). Amounts in THB.`,
    `Month ${month}, day ${daysSoFar} of ${daysInMonth}. Sales so far ${data.monthSales}; last month in total ${data.lastMonthSales}${target ? `; monthly target ${target}` : "; no target set"}.`,
    `Last 7 days sales ${data.weekSales}; the 7 days before ${data.prevWeekSales}.`,
    `Average sales by weekday (last 4 weeks): ${weekdays.join(", ") || "no data"}.`,
    `Food cost: ${food ?? "unknown"}% this month, ${foodLast ?? "unknown"}% last month.`,
    `Purchases this month ${data.purchases} (${data.receipts} receipts); unpaid bills ${s.unpaid} (${s.unpaidCount}, ${s.overdueCount} overdue); receipts with warnings ${s.toCheck}.`,
    `Price rises this month: ${rises.join("; ") || "none"}.`,
  ].join("\n");
  return { data, facts };
}

const LANG_NAME: Record<LineLang, string> = { ko: "Korean", ja: "Japanese", th: "Thai", en: "English" };
let client: Anthropic | null = null;

/** Three short, practical suggestions from the week's numbers (none when the AI is not available) */
export async function weeklyTips(facts: string, lang: LineLang): Promise<Tip[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    client ??= new Anthropic({ maxRetries: 1 });
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1200,
      output_config: { effort: "low" },
      system:
        "You are the bookkeeping assistant of a small restaurant company in Thailand. From this week's numbers, give the owner exactly three short, practical suggestions for running the business this week. Use only the numbers given; never invent figures. Each: a title (one sentence, at most 40 characters) and a body (at most 90 characters) with a concrete action. Reply only with JSON: {\"tips\":[{\"title\":\"\",\"body\":\"\"}]}",
      messages: [{ role: "user", content: `${facts}\n\nWrite the suggestions in ${LANG_NAME[lang]}.` }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { tips?: { title?: unknown; body?: unknown }[] };
    return (parsed.tips ?? [])
      .filter((t) => typeof t.title === "string" && typeof t.body === "string")
      .slice(0, 3)
      .map((t) => ({ title: String(t.title).slice(0, 80), body: String(t.body).slice(0, 200) }));
  } catch (e) {
    console.warn("[weekly] tips failed", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Push the report to every linked admin, each in their LINE language. Returns how many got it. */
export async function sendWeeklyReport(admin: Admin, appUrl: string, today: string, to: string[]): Promise<number> {
  if (!to.length) return 0;
  const made = await weeklyData(admin, today);
  if (!made) return 0;
  const tips = new Map<LineLang, Tip[]>();
  let sent = 0;
  for (const id of to) {
    const lang = await profileLang(id);
    if (!tips.has(lang)) tips.set(lang, await weeklyTips(made.facts, lang));
    try {
      await lineClient().pushMessage({ to: id, messages: [weeklyCard(made.data, tips.get(lang)!, lang, `${appUrl}/`)] });
      sent += 1;
    } catch (e) {
      console.error("[weekly] push failed", e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
