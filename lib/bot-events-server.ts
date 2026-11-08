// Events the books send to Grok Bot the moment they happen (owner, 2026-11-08): a staff expense claim, a saved receipt
// worth a look (the same receipt twice, a big spend, a new supplier, withholding). Each goes to every webhook an owner
// pasted in settings (public.bot_webhooks = a Grok Bot routine started "when a webhook is triggered"), as JSON with
// "Authorization: Bearer <key>". Grok decides what to tell the owner. Best effort: a failed send is logged, never thrown.

import { findAnomalies } from "./anomalies";
import { openWarnings } from "./dashboard";
import type { Claim } from "./expenses";
import { ledger, type Admin } from "./line-ask-server";
import { todayBangkok } from "./thai-tax";
import { hasWht, whtTax } from "./wht";

export interface BotEvent {
  event: "receipt" | "claim" | "test";
  title: string;
  /** Plain lines Grok can read as they are */
  lines: string[];
  open?: string;
  data?: Record<string, unknown>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Post one event to every enabled webhook (at most 3), 8 s each; records the answer on the row */
export async function sendBotEvent(admin: Admin, ev: BotEvent): Promise<number> {
  const { data: hooks } = await admin.from("bot_webhooks").select("id, url, key").eq("enabled", true).order("created_at").limit(3);
  if (!hooks?.length) return 0;
  const body = JSON.stringify({ source: "Sawadee TAX", at: new Date().toISOString(), ...ev, text: [ev.title, ...ev.lines].join("\n") });
  let sent = 0;
  for (const h of hooks) {
    let status = 0;
    try {
      const r = await fetch(h.url as string, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${h.key as string}`, "user-agent": "SawadeeTAX/1.0" },
        body,
        signal: AbortSignal.timeout(8000),
        redirect: "manual",
      });
      status = r.status;
      if (r.ok) sent++;
    } catch (e) {
      status = -1;
      console.error("[bot-event] send failed:", e instanceof Error ? e.message : e);
    }
    await admin.from("bot_webhooks").update({ last_sent_at: new Date().toISOString(), last_status: status }).eq("id", h.id);
  }
  return sent;
}

/** A new staff expense claim */
export function claimEvent(c: Claim, pendingCount: number, appUrl: string): BotEvent {
  return {
    event: "claim",
    title: `New expense claim from ${c.name}: ฿${r2(c.amount / 100).toLocaleString("en-US")}`,
    lines: [
      `Who: ${c.name}`,
      `Paid to: ${c.seller || "?"}`,
      `Amount: ฿${r2(c.amount / 100).toLocaleString("en-US")}`,
      `Category: ${c.category}`,
      `Day: ${c.day}`,
      ...(c.note ? [`Note: ${c.note}`] : []),
      `Waiting for approval now: ${pendingCount}`,
      "Only an owner or admin approves it in the app (Expenses).",
    ],
    open: `${appUrl}/expenses`,
    data: { claimId: c.id, amountBaht: r2(c.amount / 100), category: c.category, day: c.day, pendingCount },
  };
}

/**
 * A receipt just saved, when there is something to say: the same receipt twice, far above the usual of its category,
 * a new supplier, or withholding tax on it. Nothing is sent for an ordinary receipt (the nightly wrap-up covers those).
 */
export async function documentEvent(admin: Admin, id: string, appUrl: string, today = todayBangkok()): Promise<BotEvent | null> {
  const books = await ledger(admin);
  const me = books.saved.find((d) => d.id === id);
  if (!me) return null;
  const odd = findAnomalies(books.saved, me.created, me.created).filter((a) => a.id === id);
  const reasons: string[] = [];
  const vendor = me.doc.seller.name.en || me.doc.seller.name.th || me.doc.seller.name.ja || "?";
  for (const a of odd) {
    if (a.kind === "dup") reasons.push(`Looks like the same receipt as an earlier one (document no. ${a.docNo}): ${appUrl}/documents/${a.otherId}`);
    if (a.kind === "big") reasons.push(`฿${r2(a.amount).toLocaleString("en-US")} is far above the usual ฿${r2(a.usual).toLocaleString("en-US")} for ${a.category}`);
    if (a.kind === "new") reasons.push(`First receipt from this supplier${a.taxIdValid ? "" : " — its tax ID does not pass the check digit"}`);
  }
  if (hasWht(me.doc)) reasons.push(`Withholding tax ฿${r2(whtTax(me.doc)).toLocaleString("en-US")} to file with ภ.ง.ด.3/53 for the month it is paid`);
  // The automatic checks still open on it (minus the ones a person marked fine), as the dashboard counts them
  const open = openWarnings(books.saved, books.taxId, today).get(id) ?? [];
  if (open.length) reasons.push(`Automatic checks to look at: ${open.join(", ")}`);
  if (!reasons.length) return null;
  return {
    event: "receipt",
    title: `Receipt worth a look: ${vendor} ฿${r2(me.doc.totals.net).toLocaleString("en-US")}`,
    lines: [`Supplier: ${vendor}`, `Date: ${me.doc.date}`, `Total: ฿${r2(me.doc.totals.net).toLocaleString("en-US")} (VAT ฿${r2(me.doc.totals.vat).toLocaleString("en-US")})`, `Category: ${me.doc.category}`, ...reasons.map((r) => `• ${r}`), `Saved today (${today}).`],
    open: `${appUrl}/documents/${id}`,
    data: { documentId: id, totalBaht: me.doc.totals.net, category: me.doc.category, reasons: odd.map((a) => a.kind) },
  };
}

export const testEvent = (appUrl: string): BotEvent => ({
  event: "test",
  title: "Sawadee TAX test: the connection to this routine works",
  lines: ["From now on the books send a message here when a staff expense claim comes in or a saved receipt needs a look.", "Nothing to do for this test."],
  open: `${appUrl}/`,
});
