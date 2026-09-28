// LINE bot: what happens for each webhook event (server only — uses the service-role client).
//   follow            → how to link
//   text "123456"     → "checking the code" + the result: link this LINE account to the member who got that code
//   any other text / sticker … → no reply (people chat here; the bot only speaks when it has something to say)
//   image             → linked members only: AI reading → vendor dictionary → saved to the ledger
//                       (status "reviewed", as that member) → receipt card with the automatic checks
//   file .xlsx / .csv → linked members only: a POS sales export, read with the columns the app remembered from an
//                       import (company_settings.pos_columns) → one line per day and channel in public.sales
// Only 1:1 chats are served; groups and rooms are ignored.

import crypto from "node:crypto";
import type { messagingApi, webhook } from "@line/bot-sdk";
import { type LedgerRef, runChecks } from "./checks";
import { docToRow } from "./db-map";
import { paidAtTill } from "./archive";
import { extractDocument, MAX_IMAGE_BYTES } from "./extract-server";
import { imageType, lineBlobClient, lineClient, receiptCard, say, branchButtons, lineBranchLabel, salesBranchButtons } from "./line";
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

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3100")).replace(/\/$/, "");
}

/** Reply if the token is still good (it expires ~1 minute after the event), otherwise push */
async function send(event: { replyToken?: string }, to: string, messages: messagingApi.Message[]) {
  const client = lineClient();
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
  const { data } = await supabaseAdmin().from("members").select("user_id, name, email").eq("line_user_id", lineUser).maybeSingle();
  return data as { user_id: string; name: string; email: string } | null;
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
  if (event.type === "postback") return pickBranch(event, lineUser, event.postback.data);
  if (event.type !== "message") return;
  const message = event.message;

  // A 6-digit code, also as "123 456" or "123-456"
  if (message.type === "text" && /^\s*\d{3}[\s-]?\d{3}\s*$/.test(message.text ?? "")) return linkAccount(event, lineUser, digitsOnly(message.text));
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
    wrongCodeTries(lineUser, true);
    return send(event, lineUser, [checking, text(say.badCode)]);
  }
  const m = await memberFor(lineUser);
  await send(event, lineUser, [checking, text(say.linked(m?.name || m?.email || ""))]);
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

  // Its branch: the buyer's branch number on the invoice, else the head office (and the sender is asked)
  const { data: branchRows } = await admin.from("branches").select("id, no, name, sort");
  const branches = sortBranches(((branchRows ?? []) as Branch[]).map((b) => ({ ...b, name: b.name ?? "", sort: Number(b.sort) || 0, color: "" })));
  doc = assignBranch(doc, branches);
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
  const card = receiptCard(doc, checks, `${appUrl()}/documents/${id}`);
  await send(later, lineUser, ask ? [card, { ...text(say.branchAsk), quickReply: branchButtons(id, branches) }] : [card]);
  console.log(`[line] saved ${id}: AI ${(aiMs / 1000).toFixed(1)}s, total ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** A POS sales export: with one branch it is saved at once; with several, the sender picks the branch first */
async function salesFile(event: webhook.MessageEvent, lineUser: string, messageId: string, fileName: string) {
  const member = await memberFor(lineUser);
  if (!member) return send(event, lineUser, [text(say.welcome)]);
  if (limited(`file:${member.user_id}`, 5, 60_000)) return send(event, lineUser, [text(say.rate)]);
  const { data: branchRows } = await supabaseAdmin().from("branches").select("id, no, name, sort");
  const branches = sortBranches(((branchRows ?? []) as Branch[]).map((b) => ({ ...b, name: b.name ?? "", sort: Number(b.sort) || 0, color: "" })));
  if (branches.length > 1) return send(event, lineUser, [{ ...text(say.fileBranchAsk), quickReply: salesBranchButtons(messageId, fileName, branches) }]);
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
    text(
      say.salesSaved(
        {
          days: new Set(dates).size,
          from: dates[0] ?? "",
          to: dates[dates.length - 1] ?? "",
          gross: sum("gross"),
          vat: sum("vat"),
          locked: valid.length - open.length,
          invalid: days.length - valid.length,
          branch: branch ? lineBranchLabel(branch) : "",
        },
        `${appUrl()}/sales`,
      ),
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
  const xl = q.get("xl");
  if (xl) {
    const { data: b } = await admin.from("branches").select("id, no, name").eq("id", branchId).maybeSingle();
    if (!b) return send(event, lineUser, [text(say.branchGone)]);
    return importSales(event, lineUser, member.user_id, xl, decodeURIComponent(q.get("fn") ?? "sales.xlsx"), { ...(b as Branch), sort: 0, color: "" });
  }
  if (!docId) return;
  const { data: b } = await admin.from("branches").select("id, no, name").eq("id", branchId).maybeSingle();
  if (!b) return send(event, lineUser, [text(say.branchGone)]);
  const { error } = await admin.from("documents").update({ branch_id: branchId }).eq("id", docId);
  if (error) throw error;
  await send(event, lineUser, [text(say.branchSet(lineBranchLabel(b as { no: string; name: string })))]);
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
