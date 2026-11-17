// What the AI assistant (LINE and in the app) knows about the screens added 2026-11-18 (owner: "추가한 기능으로 AI가 라인이나
// 비서에서도 도움을"): bills to pay by due date (/ledger/payables), the tax month's returns with their amounts, deadlines
// and filed ticks (/ledger/taxes), contracts ending or with a notice date coming (/contracts), and — only while the
// restaurant extra is switched on — the waste log (/waste), tomorrow's prep (lib/prep-forecast) and the delivery apps'
// settlements (fees the apps kept). Short lines of text added to the books (lib/assistant-server booksContext). Pure.

import { contractState, type Contract, noticeBy, daysBetween } from "./contracts";
import { buildWhtFiling } from "./filing";
import type { FoodFeatures } from "./food-features";
import { bucketTotals, unpaidBills } from "./payables";
import { dailySales, prepForecast, prepIngredients } from "./prep-forecast";
import type { Sale } from "./sales";
import { hubMonth, monthDeadlines, monthlyDoneKey, payrollTaxes, vatDoneKey } from "./tax-hub";
import type { LedgerDoc } from "./types";
import { wasteMonth, type WasteLog } from "./waste";

const r0 = (n: number) => Math.round(n);
const b = (satang: number) => r0(satang / 100);

export interface ExtrasInput {
  today: string;
  appUrl: string;
  saved: readonly { id: string; doc: LedgerDoc }[];
  sales: readonly Pick<Sale, "branchId" | "date" | "gross" | "vat">[];
  /** Pay lines of the tax month (ภ.ง.ด.1 + social security) */
  payroll: readonly { month: string; wht: number; ssEmployee: number; ssEmployer: number }[];
  /** The tax calendar's ticks (calendar_done keys) */
  done: ReadonlySet<string>;
  contracts: readonly Contract[];
  waste: readonly WasteLog[];
  features: FoodFeatures;
  foodKeys: ReadonlySet<string>;
  /** Weekdays every branch is closed */
  closedDays: readonly number[];
}

export function extrasLines(i: ExtrasInput): string[] {
  const out: string[] = [];
  const link = (path: string) => (i.appUrl ? ` — ${i.appUrl}${path}` : "");

  // Bills to pay, by due date (net of withholding = what leaves the bank)
  const bills = unpaidBills(i.saved, i.today);
  if (bills.length) {
    const t = bucketTotals(bills);
    out.push(
      "",
      `## Bills to pay by due date (page "To pay"${link("/ledger/payables")})`,
      `Late ${b(t.late.amount)} (${t.late.count}) · within 7 days ${b(t.week.amount)} (${t.week.count}) · within 30 days ${b(t.month.amount)} (${t.month.count}) · later ${b(t.later.amount)} (${t.later.count}) · no due date ${b(t.none.amount)} (${t.none.count}). Amounts after withholding tax.`,
    );
  }

  // The tax month's returns (the tax hub)
  const month = hubMonth(null, i.today);
  const due = monthDeadlines(month);
  const wht = buildWhtFiling(i.saved, month);
  const pay = payrollTaxes(i.payroll.filter((p) => p.month === month));
  const filed = (k: string) => (i.done.has(k) ? "filed" : "not filed yet");
  out.push(
    "",
    `## Tax returns for ${month} (page "Tax returns"${link(`/ledger/taxes?month=${month}`)}; the numbers to type in: ${i.appUrl ? `${i.appUrl}/ledger/filing/${month}` : "the filing helper"})`,
    `VAT ภ.พ.30: e-filing by ${due.pp30.online} (paper ${due.pp30.paper}) — ${filed(vatDoneKey(month))}.`,
    `Withholding ภ.ง.ด.53 (companies): ${r0(wht.totals.pnd53.tax)} on ${wht.pnd53.length} payment(s); ภ.ง.ด.3 (people): ${r0(wht.totals.pnd3.tax)} on ${wht.pnd3.length}; e-filing by ${due.pnd53.online} (paper ${due.pnd53.paper})${wht.badIds.length ? `; ${wht.badIds.length} payee tax ID(s) to fix first` : ""}${wht.unpaid ? `; ${wht.unpaid} withholding document(s) not marked paid yet` : ""} — ${filed(monthlyDoneKey(month))}.`,
    pay.people ? `Payroll ภ.ง.ด.1 tax ${b(pay.pnd1)} + social security ${b(pay.sso)} (both sides), due ${due.pnd1.online} — ${filed(monthlyDoneKey(month))}.` : `Payroll: no pay lines saved for ${month}.`,
  );

  // Contracts: ending, notice dates (only those that matter in the next 60 days, plus a count)
  if (i.contracts.length) {
    const near = i.contracts
      .map((c) => ({ c, state: contractState(c, i.today), notice: noticeBy(c) }))
      .filter(({ c, state, notice }) => state === "soon" || (notice && daysBetween(i.today, notice) <= 60 && daysBetween(i.today, notice) >= -7) || (c.endOn && daysBetween(i.today, c.endOn) <= 60 && daysBetween(i.today, c.endOn) >= -7))
      .slice(0, 12);
    out.push("", `## Contracts (page "Contracts"${link("/contracts")}): ${i.contracts.length} kept`);
    if (near.length)
      out.push(
        ...near.map(({ c, notice }) => `${c.title}${c.party ? ` with ${c.party}` : ""} (${c.kind}): ${c.startOn ?? "?"} – ${c.endOn ?? "no end"}${c.autoRenew ? ", renews by itself" : ""}${notice ? `, give notice by ${notice}` : ""}${c.amount !== null ? `, amount ${b(c.amount)}` : ""}`),
      );
    else out.push("Nothing ends or needs notice in the next 60 days.");
  }

  // Restaurant extras, only while switched on
  if (i.features.waste) {
    const w = wasteMonth(i.waste, i.today.slice(0, 7));
    out.push(
      "",
      `## Waste log this month (page "Waste log"${link("/waste")}; on LINE: "폐기" then e.g. "milk 2L spoiled ฿90")`,
      w.lines
        ? `${b(w.total)} in ${w.lines} record(s)${w.change !== null ? ` (${w.change > 0 ? "+" : ""}${w.change}% vs last month)` : ""}; most: ${w.items.slice(0, 3).map((x) => `${x.item} ${b(x.amount)}`).join(", ")}; reasons: ${w.reasons.map((r) => `${r.reason} ${b(r.amount)}`).join(", ")}${w.unpriced ? `; ${w.unpriced} without a value` : ""}.`
        : "Nothing recorded yet this month.",
    );
  }
  if (i.features.prep) {
    const f = prepForecast(dailySales(i.sales as Sale[]), i.today, i.closedDays);
    if (f.enough) {
      const ings = prepIngredients(i.saved.map((s) => s.doc), i.foodKeys, i.today, f, 6);
      out.push(
        "",
        "## Prep forecast (sales without VAT; ingredients from the last 4 weeks' food purchases — an estimate)",
        `A usual open day ${f.usual}. Next days: ${f.days.map((d) => `${d.day} ${d.advice === "closed" ? "closed" : `${d.expected} (${d.pct >= 0 ? "+" : ""}${d.pct}%)`}`).join(", ")}.`,
        ...(ings.length ? [`Tomorrow's prep: ${ings.map((x) => `${x.name} ${x.tomorrow}${x.unit ? ` ${x.unit}` : ""}`).join(", ")}.`] : []),
      );
    }
  }
  if (i.features.delivery) {
    // Fee documents saved from settlements: "<APP>-yyyymmdd-mmdd", note "Settlement … · sales N"
    const fees = i.saved
      .filter((s) => /^(GRAB|LINEMAN|FOODPANDA|SHOPEEFOOD|ROBINHOOD)-\d{8}-\d{4}$/.test(s.doc.docNo) && s.doc.date >= `${i.today.slice(0, 4)}-01-01`)
      .map((s) => {
        const sales = Number(/sales ([\d.]+)/.exec(s.doc.note.en)?.[1] ?? 0);
        return { app: s.doc.docNo.split("-")[0], date: s.doc.date, fee: s.doc.totals.net, sales };
      })
      .slice(0, 12);
    if (fees.length)
      out.push(
        "",
        "## Delivery-app settlements read this year (fees the apps kept, VAT included)",
        ...fees.map((x) => `${x.app} ${x.date}: fees ${r0(x.fee)} on sales ${r0(x.sales)}${x.sales > 0 ? ` = ${Math.round((x.fee / x.sales) * 1000) / 10}%` : ""}`),
      );
  }
  return out;
}
