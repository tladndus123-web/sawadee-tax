// LINE bot: what happens for each webhook event (server only — uses the service-role client).
//   follow            → how to link
//   text "123456"     → "checking the code" + the result: link this LINE account to the member who got that code
//   any other text / sticker … → no reply (people chat here; the bot only speaks when it has something to say)
//   image             → linked members only: AI reading → vendor dictionary → saved to the ledger
//                       (status "reviewed", as that member) → receipt card with the automatic checks
// Only 1:1 chats are served; groups and rooms are ignored.

import crypto from "node:crypto";
import type { messagingApi, webhook } from "@line/bot-sdk";
import { type LedgerRef, runChecks } from "./checks";
import { docToRow } from "./db-map";
import { paidAtTill } from "./archive";
import { extractDocument, MAX_IMAGE_BYTES } from "./extract-server";
import { imageType, lineBlobClient, lineClient, receiptCard, say, branchButtons, lineBranchLabel } from "./line";
import { assignBranch, type Branch, branchFromPhoto, sortBranches } from "./branches";
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
    p_row: { ...row, photo_path: photoPath },
    p_items: items,
  });
  if (saved.error) throw saved.error;

  // No locale in the link: the app picks the reader's language
  const card = receiptCard(doc, checks, `${appUrl()}/documents/${id}`);
  await send(later, lineUser, ask ? [card, { ...text(say.branchAsk), quickReply: branchButtons(id, branches) }] : [card]);
  console.log(`[line] saved ${id}: AI ${(aiMs / 1000).toFixed(1)}s, total ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/** The sender chose a branch for a document under the receipt card */
async function pickBranch(event: webhook.PostbackEvent, lineUser: string, data: string) {
  const q = new URLSearchParams(data);
  const docId = q.get("doc");
  const branchId = q.get("branch");
  if (!docId || !branchId || !(await memberFor(lineUser))) return;
  const admin = supabaseAdmin();
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
