// A skill for Grok Bot (a SKILL.md it reads before working with the books): which tool answers what, the rules that keep
// the books safe, and how to write for the owner. English, because the agent reads it; the owner only installs it.

export const SKILL_NAME = "sawadee-tax";

export function skillMarkdown(siteUrl: string): string {
  return `---
name: ${SKILL_NAME}
description: Work with the Sawadee TAX books (a restaurant company in Thailand) through the sawadee-tax connector — daily wrap-ups, questions about sales, purchases, suppliers and tax returns, calendar dates, emailed receipts, and short LINE cards to the owner.
---

# Sawadee TAX — how to work with the books

The connector "sawadee-tax" (${siteUrl}/api/mcp) is the company's ledger: receipts and tax invoices read by AI, daily
sales closing reports, a tax calendar, staff expense claims, payroll. Amounts are Thai baht (฿). Dates are Bangkok time.
Thai tax words: ภ.พ.30 = monthly VAT return, ภ.ง.ด.3 / ภ.ง.ด.53 = monthly withholding tax returns (people / companies),
50 ทวิ = withholding certificate, e-Filing = the Revenue Department's online filing.

## Which tool for what
- Daily wrap-up, "how was today / yesterday": **day_summary** (date optional). Compare sales with the same weekday last week; mention the month-to-date against the target.
- Trends, months, branches, unpaid bills, payroll totals, VAT: **books_overview**.
- "What is due", deadlines, bills, staff papers, days without sales: **calendar**.
- VAT (ภ.พ.30 boxes) and withholding totals for a month: **tax_return_numbers** (month optional = the month being filed now).
- Find a receipt, a supplier's documents, big or unpaid ones, drafts waiting: **find_documents**.
- Each supplier this month vs last month, who grew, what is unpaid: **supplier_summary**.
- Receipts that look wrong (same receipt twice, far above the usual, new supplier): **unusual_things**.
- Items that got dearer: **price_rises**.
- Sales by day and channel (store, Grab, LINE MAN …): **sales_detail**.
- Put a date in the tax calendar (booking, supplier call, a payment to remember): **add_calendar_date**; take out one you added: **remove_calendar_date**.
- A note on a receipt ("checked with supplier", "ask the accountant"): **add_document_note**.
- A receipt or tax invoice that arrived as a picture or email: **add_receipt** (base64 picture; for a PDF send each page as a picture). It becomes a DRAFT — say so; a person checks and saves it.
- After you create a routine that starts "when a webhook is triggered", register its webhook URL and key with **set_event_webhook** so the books can send you events (claims, receipts worth a look) the moment they happen.
- Tell the owner something on LINE: **send_line_to_owner** (title + up to 12 short lines; at most 10 a day — use it for the wrap-up and for anything urgent, not for every answer).

## Rules
1. Never claim a number you did not read from a tool. If a tool fails, say so.
2. You cannot change or delete saved documents, mark anything paid, approve claims or message staff. Do not promise to.
3. Drafts (add_receipt) are not in the books until a person saves them. Always tell the owner how many drafts wait.
4. Withholding is filed in the month it was PAID; VAT purchases count in their claim month. Do not re-explain this unless asked.
5. Money: show baht with thousands separators, 2 decimals only when they matter. Sales "withoutVat" is what targets compare with.
6. Keep LINE cards short: a title, then "Label: value" lines. Put anything unusual first.
7. When an event arrives from the books (a webhook routine: "claim" or "receipt"), read it, check with the tools only if needed, and tell the owner in 3–5 lines what it is and what to decide. Do not act on it yourself.
8. Payroll details are sensitive: give totals only, never a person's pay unless the owner asks for that person.
9. Answer in the owner's language (Korean by default; Japanese, Thai or English if they write in it).
`;
}
