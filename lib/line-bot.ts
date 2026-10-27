// LINE bot: what happens for each webhook event (server only — uses the service-role client).
//   follow            → how to link
//   text "123456"     → "checking the code" + the result: link this LINE account to the member who got that code
//   menu button / short word ("요약", "売上" …) → admins only: the ledger's own numbers (lib/line-ask.ts)
//   any other text            → admins: the AI assistant answers (lib/assistant*.ts); others: no reply
//   sticker …                 → no reply
//   "경비" / "เบิก" / "経費" / "expense" → members: expense mode for 10 minutes (lib/expense-line-server.ts)
//   image in expense mode → a claim of the sender (not a ledger document); admins get the approve / reject card
//   image             → linked members only: AI reading → vendor dictionary → saved to the ledger
//                       (status "reviewed", as that member) → receipt card with the automatic checks
//   file .xlsx / .csv → linked members only: a POS sales export, read with the columns the app remembered from an
//                       import (company_settings.pos_columns) → one line per day and channel in public.sales
// Only 1:1 chats are served; groups and rooms are ignored.

import crypto from "node:crypto";
import type { messagingApi, webhook } from "@line/bot-sdk";
import { appUrl } from "./app-url";
import { type LedgerRef, runChecks } from "./checks";
import { docToRow } from "./db-map";
import { paidAtTill } from "./archive";
import { extractDocument, MAX_IMAGE_BYTES } from "./extract-server";
import { assistantSay } from "./assistant";
import { isExpenseWord } from "./expense-line";
import { claimFromLine, expenseButton, inExpenseMode, notifyNewClaim, startExpenseMode } from "./expense-line-server";
import { answer } from "./assistant-server";
import { aiCard, goalCard, goalSetText, noticeMessage, shareCard } from "./line-dash";
import { createShare, goalSuggestion, setGoals } from "./month-end-server";
import { type Ask, askFromData, askFromText, askSay, uploadPrompt } from "./line-ask";
import { askAnswer } from "./line-ask-server";
import { linkAdminMenu, profileLang, unlinkMenu, UPLOAD_DATA } from "./line-menu";
import { branchButtons, branchWords, imageType, lineBlobClient, lineBranchLabel, lineClient, receiptCard, salesBranchButtons, say } from "./line";
import { inLang, type LineLang } from "./line-lang";
import { aggregate, applySavedColumns, findHeader, posColumnsOf } from "./pos-import";
import { isPosFileName, readPosBuffer } from "./pos-read-server";
import { assignBranch, type Branch, branchFromPhoto, sortBranches } from "./branches";
import { findDuplicate } from "./photo-hash";
import { photoHashServer } from "./photo-hash-server";
import { supabaseAdmin } from "./supabase/admin";
import { digitsOnly } from "./thai-tax";
import { applyHistory, applyRule, applyVendor, toVendor, type VendorHistory, type VendorRow, VENDOR_COLUMNS, vendorKey } from "./vendors";

// In-memory limits (one server). Photos: 10 a minute per member, like the upload screen.
const hits = new Map<string, number[]>();
function limited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  const over = recent.length >= limit;
  if (!over) recent.push(now);
  hits.set(key, recent);
  return over;
}
// Last "received" notice per LINE account
const lastNotice = new Map<string, number>();
// Codes: 5 wrong tries per 10 minutes per LINE account, so 6-digit codes cannot be guessed
const wrongCodes = new Map<string, number[]>();
function wrongCodeTries(lineUser: string, add = false): number {
  const recent = (wrongCodes.get(lineUser) ?? []).filter((t) => Date.now() - t < 600_000);
  if (add) recent.push(Date.now());
  wrongCodes.set(lineUser, recent);
  return recent.length;
}

export { appUrl };

// The reader's phone language (LINE profile), remembered for an hour
const langs = new Map<string, { lang: LineLang; at: number }>();
async function langOf(lineUser: string): Promise<LineLang> {
  const hit = langs.get(lineUser);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.lang;
  const lang = await profileLang(lineUser);
  langs.set(lineUser, { lang, at: Date.now() });
  return lang;
}

/** Reply if the token is still good (it expires ~1 minute after the event), otherwise push — in the reader's language */
async function send(event: { replyToken?: string }, to: string, given: messagingApi.Message[]) {
  const client = lineClient();
  const lang = await langOf(to);
  const messages = given.map((m) => (m.type === "text" ? { ...m, text: inLang((m as messagingApi.TextMessage).text, lang) } : m)).slice(-5);
  if (event.replyToken) {
    try {
      await client.replyMessage({ replyToken: event.replyToken, messages });
      return;
    } catch (e) {
      console.warn("[line] reply failed, pushing instead", e instanceof Error ? e.message : e);
    }
  }
  await client.pushMessage({ to, messages });
}
const text = (t: string): messagingApi.TextMessage => ({ type: "text", text: t });

async function memberFor(lineUser: string) {
  const { data } = await supabaseAdmin().from("members").select("user_id, name, email, role, disabled_at").eq("line_user_id", lineUser).maybeSingle();
  return data as { user_id: string; name: string; email: string; role: string; disabled_at: string | null } | null;
}

export async function handleLineEvent(event: webhook.Event): Promise<void> {
  const source = event.source;
  if (source?.type !== "user" || !source.userId) return;
  const lineUser = source.userId;

  if (event.type === "follow") {
    const m = await memberFor(lineUser);
    await send(event, lineUser, [text(m ? say.linked(m.name || m.email) : say.welcome)]);
    return;
  }
  if (event.type === "postback") {
    const data = event.postback.data;
    if (data === UPLOAD_DATA) return uploadButtons(event, lineUser);
    if (/^(share|goal|goalset)=/.test(data)) return monthEndAction(event, lineUser, data);
    if (data.startsWith("expense=")) {
      await expenseButton(lineUser, data, (m) => send(event, lineUser, m));
      return;
    }
    const ask = askFromData(data);
    return ask ? answerAsk(event, lineUser, ask, true) : pickBranch(event, lineUser, data);
  }
  if (event.type !== "message") return;
  const message = event.message;

  // A 6-digit code, also as "123 456" or "123-456"
  if (message.type === "text" && /^\s*\d{3}[\s-]?\d{3}\s*$/.test(message.text ?? "")) return linkAccount(event, lineUser, digitsOnly(message.text));
  if (message.type === "text" && isExpenseWord(message.text ?? "")) return startExpenseMode(lineUser, (m) => send(event, lineUser, m));
  if (message.type === "text") {
    const ask = askFromText(message.text ?? "");
    if (ask) return answerAsk(event, lineUser, ask, false);
    return chat(event, lineUser, message.text ?? "");
  }
  if (message.type === "image") return saveReceipt(event, lineUser, message.id);
  if (message.type === "file" && isPosFileName(message.fileName ?? "")) return salesFile(event, lineUser, message.id, message.fileName ?? "");
  // Anything else (ordinary chat, stickers …): no automatic reply
}

// Answers with two messages in one reply (free, no push quota): "checking the code…", then the result
async function linkAccount(event: webhook.MessageEvent, lineUser: string, code: string) {
  const checking = text(say.checking);
  if (wrongCodeTries(lineUser) >= 5) return send(event, lineUser, [checking, text(say.tooManyTries)]);
  const admin = supabaseAdmin();
  const { data: userId, error } = await admin.rpc("line_link", { p_code: code, p_line_user: lineUser });
  if (error) throw error;
  if (!userId) {
    // Not a member's code: an employee's (payslips on LINE)?
    const emp = await admin.rpc("employee_line_link", { p_code: code, p_line_user: lineUser });
    if (emp.error) throw emp.error;
    if (emp.data) {
      const { data: e } = await admin.from("employees").select("name").eq("id", emp.data).maybeSingle();
      return send(event, lineUser, [checking, text(say.employeeLinked(e?.name ?? ""))]);
    }
    wrongCodeTries(lineUser, true);
    return send(event, lineUser, [checking, text(say.badCode)]);
  }
  const m = await memberFor(lineUser);
  await send(event, lineUser, [checking, text(say.linked(m?.name || m?.email || ""))]);
  // Admins get the menu with the ledger buttons at the bottom of the chat
  if (m?.role === "admin") await linkAdminMenu(lineUser);
}

/**
 * The AI assistant: an admin's question, answered from the books (Haiku; a long analysis by Sonnet, 10 a month).
 * Anyone else's messages stay unanswered, as before — people chat here too.
 */
async function chat(event: { replyToken?: string }, lineUser: string, question: string) {
  const q = question.trim().slice(0, 2000);
  if (!q || !process.env.ANTHROPIC_API_KEY) return;
  const member = await memberFor(lineUser);
  if (!member || member.role !== "admin" || member.disabled_at) return;
  if (limited(`chat:${member.user_id}`, 20, 600_000)) return send(event, lineUser, [text(assistantSay.rate)]);
  const typing = () =>
    lineClient()
      .showLoadingAnimation({ chatId: lineUser, loadingSeconds: 60 })
      .catch(() => undefined);
  await typing();
  // The reply token is used once: by the "analysing" notice when there is one, else by the answer
  let later: { replyToken?: string } = event;
  try {
    const a = await answer(supabaseAdmin(), member.user_id, q, async (n) => {
      await send(later, lineUser, [text(assistantSay.thinking(n))]);
      later = {};
      await typing();
    }, appUrl());
    await send(later, lineUser, [a.card ? aiCard(a.card) : text(a.text), ...(a.deepUsedUp ? [text(assistantSay.deepUsedUp)] : [])]);
    console.log(`[line] assistant ${a.model}${a.deepCount ? ` (${a.deepCount} this month)` : ""}`);
  } catch (e) {
    console.error("[line] assistant failed", e instanceof Error ? e.message : e);
    await send(later, lineUser, [text(assistantSay.failed)]);
  }
}

/**
 * Buttons of the month-end report, admins only: "share=YYYY-MM" makes the accountant link, "goal=YYYY-MM" suggests next
 * month's target, "goalset=YYYY-MM&p=5" saves it (worked out again here, never taken from the button).
 */
async function monthEndAction(event: { replyToken?: string }, lineUser: string, data: string) {
  const member = await memberFor(lineUser);
  if (!member) return send(event, lineUser, [text(say.welcome)]);
  if (member.role !== "admin" || member.disabled_at) return send(event, lineUser, [text(askSay.adminOnly)]);
  if (limited(`month-end:${member.user_id}`, 10, 60_000)) return send(event, lineUser, [text(say.rate)]);
  const q = new URLSearchParams(data);
  const month = q.get("share") ?? q.get("goal") ?? q.get("goalset") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
  const admin = supabaseAdmin();
  const lang = await langOf(lineUser);
  if (q.has("share")) {
    const { token, expiresAt } = await createShare(admin, member.user_id, month);
    const { data: settings } = await admin.from("company_settings").select("name").eq("id", 1).maybeSingle();
    const name = (settings?.name ?? {}) as { th?: string; en?: string };
    // The accountant reads Thai: the page opens in Thai (it has every language's words)
    return send(event, lineUser, [shareCard({ month, url: `${appUrl()}/th/share/${token}`, expires: expiresAt, company: name.th || name.en || "" }, lang)]);
  }
  const raise = q.has("goalset") ? Number(q.get("p")) : 5;
  if (![0, 5, 10].includes(raise)) return;
  const lines = await goalSuggestion(admin, month, raise);
  const view = lines.map((l) => ({ name: lineBranchLabel(l, lang), base: l.base, target: l.target }));
  if (!q.has("goalset")) return send(event, lineUser, [goalCard(month, view, lang, appUrl())]);
  if (!lines.some((l) => l.target > 0)) return send(event, lineUser, [goalCard(month, view, lang, appUrl())]);
  await setGoals(admin, month, lines, member.user_id);
  await send(event, lineUser, [text(goalSetText(month, lines.reduce((a, l) => a + l.target, 0), lang))]);
}

/** The menu's upload card: camera / photo buttons, in the person's LINE language */
async function uploadButtons(event: { replyToken?: string }, lineUser: string) {
  if (!(await memberFor(lineUser))) return send(event, lineUser, [text(say.welcome)]);
  await send(event, lineUser, [uploadPrompt(await langOf(lineUser))]);
}

/**
 * A menu button or a short word: the ledger's numbers, for active admins only. A word typed by someone who is not a
 * member stays unanswered (people chat here); a button always gets an answer.
 */
async function answerAsk(event: { replyToken?: string }, lineUser: string, ask: Ask, tapped: boolean) {
  const member = await memberFor(lineUser);
  if (!member) return tapped ? send(event, lineUser, [text(say.welcome)]) : undefined;
  if (member.role !== "admin" || member.disabled_at) {
    // Not (or no longer) an admin: the menu goes away
    if (tapped) await unlinkMenu(lineUser);
    return send(event, lineUser, [text(askSay.adminOnly)]);
  }
  if (limited(`ask:${member.user_id}`, 10, 60_000)) return send(event, lineUser, [text(say.rate)]);
  await lineClient()
    .showLoadingAnimation({ chatId: lineUser, loadingSeconds: ask === "excel" ? 20 : 5 })
    .catch(() => undefined);
  await send(event, lineUser, await askAnswer(supabaseAdmin(), ask, appUrl(), await langOf(lineUser)));
}

/**
 * The branches a member may use from LINE right now (branch PINs, 2026-10-06): admins every branch; staff the
 * branches without a PIN and the one they opened in the app with its PIN — that one first.
 */
async function usableBranches(userId: string): Promise<Branch[]> {
  const admin = supabaseAdmin();
  const [rows, ok, opened] = await Promise.all([
    admin.from("branches").select("id, no, name, sort"),
    admin.rpc("member_branches", { p_user: userId }),
    admin.from("branch_unlocks").select("branch_id").eq("user_id", userId).gt("expires_at", new Date().toISOString()).maybeSingle(),
  ]);
  const allowed = new Set(((ok.data ?? []) as unknown[]).map(String));
  const list = sortBranches(((rows.data ?? []) as Branch[]).map((b) => ({ ...b, name: b.name ?? "", sort: Number(b.sort) || 0, color: "" }))).filter((b) => allowed.has(b.id));
  const first = opened.data?.branch_id as string | undefined;
  return first ? [...list.filter((b) => b.id === first), ...list.filter((b) => b.id !== first)] : list;
}

async function saveReceipt(event: webhook.MessageEvent, lineUser: string, messageId: string) {
  const member = await memberFor(lineUser);
  if (!member) return send(event, lineUser, [text(say.welcome)]);

  const admin = supabaseAdmin();
  // LINE can deliver an event twice; only the first delivery is processed
  const claim = await admin.from("line_messages").insert({ message_id: messageId, user_id: member.user_id });
  if (claim.error) {
    if (claim.error.code === "23505") return;
    throw claim.error;
  }
  // Only the branches this member may use (staff: open one in the app with its PIN first) — before any AI cost
  const branches = await usableBranches(member.user_id);
  // Expense mode: the photo is the member's own claim (their branch, else the database's head branch)
  if (!member.disabled_at && (await inExpenseMode(lineUser))) return expensePhoto(event, lineUser, member.user_id, messageId, branches[0]?.id ?? null);
  if (!branches.length) return send(event, lineUser, [text(say.noBranch)]);
  if (limited(`photo:${member.user_id}`, 10, 60_000)) return send(event, lineUser, [text(say.rate)]);

  // "Received, please wait" right away — once per burst, so photos sent together get one notice.
  // That uses the reply token, so the result card afterwards goes out as a push (counts toward the monthly quota).
  let later: { replyToken?: string } = event;
  if (Date.now() - (lastNotice.get(lineUser) ?? 0) > 15_000) {
    lastNotice.set(lineUser, Date.now());
    await send(event, lineUser, [text(say.received)]);
    later = {};
  }

  // "Typing…" dots while the AI reads (1:1 chats only; best effort)
  await lineClient()
    .showLoadingAnimation({ chatId: lineUser, loadingSeconds: 60 })
    .catch(() => undefined);

  const started = Date.now();
  const photo = await readStream(await lineBlobClient().getMessageContent(messageId));
  const type = imageType(photo);
  if (!type) return send(later, lineUser, [text(say.unreadable)]);
  if (photo.length > MAX_IMAGE_BYTES) return send(later, lineUser, [text(say.tooBig)]);

  // The same photo again? Point to the saved one instead of reading (and paying for) it twice
  const hash = await photoHashServer(photo);
  if (hash) {
    const { data: seen } = await admin.from("documents").select("id, photo_hash").not("photo_hash", "is", null).is("deleted_at", null);
    const dup = findDuplicate(hash, (seen ?? []).map((d) => ({ id: d.id as string, hash: d.photo_hash as string })));
    if (dup) return send(later, lineUser, [text(say.duplicate(`${appUrl()}/documents/${dup.id}`))]);
  }

  const read = await extractDocument(photo, type);
  const aiMs = Date.now() - started;
  if (!read.ok) {
    if (read.detail) console.error(`[line] extract: ${read.code}`, read.detail);
    const reply = read.code === "notDoc" ? say.notDoc : read.code === "badImage" || read.code === "aiFail" ? say.unreadable : read.code === "rate" ? say.rate : say.failed;
    return send(later, lineUser, [text(reply)]);
  }

  // Same tidying and checks as an upload in the app
  let doc = read.doc;
  const key = vendorKey(doc);
  const [company, vendor, same] = await Promise.all([
    admin.from("company_settings").select("tax_id").eq("id", 1).maybeSingle(),
    key ? admin.from("vendors").select(VENDOR_COLUMNS).eq("tax_id", key).maybeSingle() : null,
    doc.docNo ? admin.from("documents").select("id, doc_no, seller").eq("doc_no", doc.docNo).is("deleted_at", null) : null,
  ]);
  doc = applyVendor(doc, vendor?.data ? toVendor(vendor.data as VendorRow) : null).doc;
  // Like an app upload: the person's last saved category/payment for this vendor beats the AI's guess
  if (vendor?.data) {
    const last = await admin
      .from("documents")
      .select("category, payment")
      .eq("vendor_id", (vendor.data as VendorRow).id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    doc = applyHistory(doc, (last.data as VendorHistory | null) ?? null).doc;
    doc = applyRule(doc, toVendor(vendor.data as VendorRow)).doc;
  }
  doc = paidAtTill(doc);
  const companyTaxId = (company.data?.tax_id as string | undefined) ?? "";
  const others: LedgerRef[] = (same?.data ?? []).map((d) => ({
    id: d.id as string,
    docNo: d.doc_no as string,
    sellerTaxId: ((d.seller as { taxId?: string } | null)?.taxId as string) ?? "",
  }));

  const id = crypto.randomUUID();
  const photoPath = `${id}/${Date.now()}.${type.split("/")[1].replace("jpeg", "jpg")}`;
  const up = await admin.storage.from("documents").upload(photoPath, photo, { contentType: type });
  if (up.error) throw up.error;

  // Its branch: the buyer's branch number on the invoice (if the sender may use it), else the branch they opened
  // (else the first they may use) — and with several, the sender is asked
  doc = assignBranch(doc, branches, branches[0].id);
  const ask = branches.length > 1 && !branchFromPhoto(doc, branches);

  const { row, items } = docToRow({ ...doc, id }, "reviewed", companyTaxId);
  const checks = runChecks(doc, { companyTaxId, others });
  row.flags = checks.filter((c) => !c.na && !c.ok).map((c) => c.key);
  const saved = await admin.rpc("line_save_document", {
    p_user: member.user_id,
    p_message: messageId,
    p_id: id,
    p_row: { ...row, photo_path: photoPath, ...(hash ? { photo_hash: hash } : {}) },
    p_items: items,
  });
  if (saved.error) throw saved.error;

  // No locale in the link: the app picks the reader's language
  const lang = await langOf(lineUser);
  const card = receiptCard(doc, checks, `${appUrl()}/documents/${id}`, lang);
  await send(later, lineUser, ask ? [card, { ...text(say.branchAsk), quickReply: branchButtons(id, branches, lang) }] : [card]);
  console.log(`[line] saved ${id}: AI ${(aiMs / 1000).toFixed(1)}s, total ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/** A receipt photo in expense mode → a claim; the admins are told on LINE */
async function expensePhoto(event: webhook.MessageEvent, lineUser: string, userId: string, messageId: string, branchId: string | null) {
  if (limited(`photo:${userId}`, 10, 60_000)) return send(event, lineUser, [text(say.rate)]);
  await lineClient()
    .showLoadingAnimation({ chatId: lineUser, loadingSeconds: 30 })
    .catch(() => undefined);
  const photo = await readStream(await lineBlobClient().getMessageContent(messageId));
  const type = imageType(photo);
  if (!type) return send(event, lineUser, [text(say.unreadable)]);
  if (photo.length > MAX_IMAGE_BYTES) return send(event, lineUser, [text(say.tooBig)]);
  const r = await claimFromLine(lineUser, photo, type, await photoHashServer(photo), branchId, async (p) => {
    const read = await extractDocument(p, type);
    if (!read.ok && read.detail) console.error(`[line] expense extract: ${read.code}`, read.detail);
    return read.ok ? { ok: true, doc: read.doc } : { ok: false };
  });
  await send(event, lineUser, [text(r.text)]);
  if (r.ok && r.pending) await notifyNewClaim(r.id, appUrl()).catch((e) => console.error("[line] expense notify", e instanceof Error ? e.message : e));
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** A POS sales export: with one branch it is saved at once; with several, the sender picks the branch first */
async function salesFile(event: webhook.MessageEvent, lineUser: string, messageId: string, fileName: string) {
  const member = await memberFor(lineUser);
  if (!member) return send(event, lineUser, [text(say.welcome)]);
  if (limited(`file:${member.user_id}`, 5, 60_000)) return send(event, lineUser, [text(say.rate)]);
  const branches = await usableBranches(member.user_id);
  if (!branches.length) return send(event, lineUser, [text(say.noBranch)]);
  if (branches.length > 1) return send(event, lineUser, [{ ...text(say.fileBranchAsk), quickReply: salesBranchButtons(messageId, fileName, branches, await langOf(lineUser)) }]);
  await importSales(event, lineUser, member.user_id, messageId, fileName, branches[0] ?? null);
}

async function importSales(event: { replyToken?: string }, lineUser: string, userId: string, messageId: string, fileName: string, branch: Branch | null) {
  const admin = supabaseAdmin();
  // Once per file, whichever branch button is tapped, and whatever LINE redelivers
  const claim = await admin.from("line_messages").insert({ message_id: `${messageId}:xl`, user_id: userId });
  if (claim.error) {
    if (claim.error.code === "23505") return send(event, lineUser, [text(say.fileAlready)]);
    throw claim.error;
  }
  await lineClient()
    .showLoadingAnimation({ chatId: lineUser, loadingSeconds: 20 })
    .catch(() => undefined);
  const buf = await readStream(await lineBlobClient().getMessageContent(messageId));
  if (buf.length > MAX_FILE_BYTES) return send(event, lineUser, [text(say.fileTooBig)]);
  const rows = await readPosBuffer(buf, fileName).catch(() => null);
  const found = rows ? findHeader(rows) : null;
  const { data: settings } = await admin.from("company_settings").select("pos_columns").eq("id", 1).maybeSingle();
  const map = found && rows ? applySavedColumns(rows[found.index] ?? [], found.map, posColumnsOf(settings?.pos_columns)) : {};
  if (!rows || !found || map.date === undefined || map.gross === undefined) return send(event, lineUser, [text(say.fileNoColumns)]);
  const { days } = aggregate(rows.slice(found.index + 1), map, "store");
  if (!days.length) return send(event, lineUser, [text(say.fileNoRows)]);

  // Same rules as the app's import: sane numbers only, closed months left alone
  const valid = days.filter((d) => d.gross >= 0 && d.vat >= 0 && d.exempt >= 0 && d.vat + d.exempt <= d.gross);
  const months = [...new Set(valid.map((d) => d.date.slice(0, 7)))];
  const { data: locks } = await admin.from("month_locks").select("month").in("month", months);
  const closed = new Set((locks ?? []).map((l) => l.month as string));
  const open = valid.filter((d) => !closed.has(d.date.slice(0, 7)));
  if (open.length) {
    const { error } = await admin.from("sales").upsert(
      open.map((d) => ({
        ...(branch ? { branch_id: branch.id } : {}),
        sale_date: d.date,
        channel: d.channel,
        doc_from: d.docFrom,
        doc_to: d.docTo,
        bills: Math.max(0, d.bills),
        gross: d.gross,
        vat: d.vat,
        exempt: d.exempt,
        note: "LINE",
        source: "excel",
      })),
      { onConflict: "branch_id,sale_date,channel" },
    );
    if (error) throw error;
  }
  const dates = open.map((d) => d.date).sort();
  const sum = (k: "gross" | "vat") => open.reduce((a, d) => a + Math.round(d[k] * 100), 0) / 100;
  await send(event, lineUser, [
    noticeMessage(
      [say.salesSaved(
        {
          days: new Set(dates).size,
          from: dates[0] ?? "",
          to: dates[dates.length - 1] ?? "",
          gross: sum("gross"),
          vat: sum("vat"),
          locked: valid.length - open.length,
          invalid: days.length - valid.length,
          branch: branch ? branchWords(branch) : null,
        },
        `${appUrl()}/sales`,
      )],
      "SALES",
      await langOf(lineUser),
    ),
  ]);
  console.log(`[line] sales file ${fileName}: ${open.length} lines`);
}

/** The sender chose a branch: for a document under the receipt card, or for a sales file */
async function pickBranch(event: webhook.PostbackEvent, lineUser: string, data: string) {
  const q = new URLSearchParams(data);
  const docId = q.get("doc");
  const branchId = q.get("branch");
  const member = await memberFor(lineUser);
  if (!branchId || !member) return;
  const admin = supabaseAdmin();
  // The button's branch must be one the member may use now (the buttons come from the LINE client)
  const usable = await usableBranches(member.user_id);
  if (!usable.some((b) => b.id === branchId)) return send(event, lineUser, [text(say.branchNotAllowed)]);
  const xl = q.get("xl");
  if (xl) {
    const { data: b } = await admin.from("branches").select("id, no, name").eq("id", branchId).maybeSingle();
    if (!b) return send(event, lineUser, [text(say.branchGone)]);
    return importSales(event, lineUser, member.user_id, xl, decodeURIComponent(q.get("fn") ?? "sales.xlsx"), { ...(b as Branch), sort: 0, color: "" });
  }
  if (!docId) return;
  const { data: b } = await admin.from("branches").select("id, no, name").eq("id", branchId).maybeSingle();
  if (!b) return send(event, lineUser, [text(say.branchGone)]);
  // …and the document must sit in a branch the member may use
  const { data: doc } = await admin.from("documents").select("branch_id").eq("id", docId).maybeSingle();
  if (!doc || !usable.some((u) => u.id === doc.branch_id)) return send(event, lineUser, [text(say.branchNotAllowed)]);
  const { error } = await admin.from("documents").update({ branch_id: branchId }).eq("id", docId);
  if (error) throw error;
  const named = b as { no: string; name: string };
  await send(event, lineUser, [text(say.branchSet(branchWords(named)))]);
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string));
  return Buffer.concat(chunks);
}

/** For the route's error path: tell the sender something went wrong */
export async function sayFailed(event: webhook.Event) {
  const to = event.source?.type === "user" ? event.source.userId : undefined;
  if (to) await send(event as { replyToken?: string }, to, [text(say.failed)]).catch(() => undefined);
}
