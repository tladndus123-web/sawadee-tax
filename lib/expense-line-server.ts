// Expense claims on LINE, server side (service role; ported 2026-10-27). A new claim goes to every admin whose LINE is
// linked (owner's choice: all admins; the first to tap decides), as a dashboard card in their phone's language; the
// buttons approve or reject it (admins only, only while it waits); the member hears when theirs was decided or paid
// back. "경비" typed to the bot puts a member in expense mode for 10 minutes: their receipt photos become claims.
// Nothing is sent without a LINE channel or when LINE is turned off for claims (company_settings.expenses.line).

import crypto from "node:crypto";
import type { messagingApi } from "@line/bot-sdk";
import en from "@/messages/en.json";
import ja from "@/messages/ja.json";
import ko from "@/messages/ko.json";
import th from "@/messages/th.json";
import { claimFlags } from "./expense-checks";
import { expensePostback, expenseWords, fillIn, flagTexts } from "./expense-line";
import { docAmount, readExpenseSettings, rowToClaim } from "./expenses";
import { lineClient, lineConfig } from "./line";
import { claimCard } from "./line-dash";
import type { LineLang } from "./line-lang";
import { profileLang } from "./line-menu";
import { bahtWhole } from "./money";
import { findDuplicate } from "./photo-hash";
import { supabaseAdmin } from "./supabase/admin";
import { todayBangkok } from "./thai-tax";
import type { LedgerDoc } from "./types";

type Admin = ReturnType<typeof supabaseAdmin>;
type Send = (messages: messagingApi.Message[]) => Promise<void>;

const lineReady = () => !!lineConfig().channelAccessToken;
const CATEGORY = { ja: ja.category, th: th.category, en: en.category, ko: ko.category } as const;

async function categoryName(admin: Admin, key: string, lang: LineLang): Promise<string> {
  const { data } = await admin.from("categories").select("name").eq("key", key).maybeSingle();
  const own = (data?.name as Record<string, string> | undefined)?.[lang]?.trim();
  return own || (CATEGORY[lang] as Record<string, string>)[key] || key;
}

async function settingsOf(admin: Admin) {
  const { data } = await admin.from("company_settings").select("expenses").eq("id", 1).maybeSingle();
  return readExpenseSettings(data?.expenses);
}

async function loadClaim(admin: Admin, id: string) {
  const { data } = await admin.from("expense_claims").select("*").eq("id", id).maybeSingle();
  return data ? rowToClaim(data as Record<string, unknown>) : null;
}

/** A new claim → every admin with LINE; returns how many were sent */
export async function notifyNewClaim(id: string, appUrl: string): Promise<number> {
  if (!lineReady()) return 0;
  const admin = supabaseAdmin();
  const c = await loadClaim(admin, id);
  if (!c || c.status !== "pending") return 0;
  const [settings, { data: admins }, all, ledger] = await Promise.all([
    settingsOf(admin),
    admin.from("members").select("line_user_id").eq("role", "admin").is("disabled_at", null).not("line_user_id", "is", null),
    admin.from("expense_claims").select("*"),
    admin.from("documents").select("id, photo_hash").is("deleted_at", null).not("photo_hash", "is", null),
  ]);
  if (!settings.line || !admins?.length) return 0;
  const photoUrl = c.photoPath ? ((await admin.storage.from("documents").createSignedUrl(c.photoPath, 3 * 86_400)).data?.signedUrl ?? null) : null;
  const claims = (all.data ?? []).map((r) => rowToClaim(r as Record<string, unknown>));
  const month = c.day.slice(0, 7);
  const monthTotal = claims.filter((x) => x.userId === c.userId && x.status !== "rejected" && x.day.startsWith(month)).reduce((a, x) => a + x.amount, 0);
  // What to look at before approving: the same checks as the app (lib/expense-checks)
  const flags = claimFlags(c, { claims, ledgerPhotos: (ledger.data ?? []).map((d) => ({ id: d.id as string, hash: d.photo_hash as string })) });
  let sent = 0;
  for (const a of admins) {
    const lang = await profileLang(a.line_user_id as string);
    const msg = claimCard(
      {
        id: c.id,
        name: c.name,
        day: c.day,
        seller: c.seller,
        amount: c.amount,
        what: await categoryName(admin, c.category, lang),
        note: c.note,
        monthTotal,
        photoUrl: photoUrl?.startsWith("https://") ? photoUrl : null,
        appUrl: `${appUrl}/expenses`,
        flags: flagTexts(flags, lang),
      },
      lang,
    );
    await lineClient().pushMessage({ to: a.line_user_id as string, messages: [msg] });
    sent++;
  }
  return sent;
}

/** Tells the member their claim was decided or paid back (when their LINE is linked) */
export async function notifyClaimant(id: string): Promise<boolean> {
  if (!lineReady()) return false;
  const admin = supabaseAdmin();
  const c = await loadClaim(admin, id);
  if (!c?.userId || !["approved", "rejected", "paid"].includes(c.status)) return false;
  const [{ data: m }, settings] = await Promise.all([admin.from("members").select("line_user_id").eq("user_id", c.userId).is("disabled_at", null).maybeSingle(), settingsOf(admin)]);
  if (!m?.line_user_id || !settings.line) return false;
  const w = expenseWords(await profileLang(m.line_user_id as string));
  const text = fillIn(c.status === "approved" ? w.toStaffOk : c.status === "paid" ? w.toStaffPaid : w.toStaffNo, { amount: bahtWhole(c.amount / 100) });
  await lineClient().pushMessage({ to: m.line_user_id as string, messages: [{ type: "text", text }] });
  return true;
}

/** The Approve / Reject buttons; false when the postback is not ours */
export async function expenseButton(lineUser: string, data: string, send: Send): Promise<boolean> {
  const p = expensePostback(data);
  if (!p) return false;
  const admin = supabaseAdmin();
  const { data: m } = await admin.from("members").select("user_id, role").eq("line_user_id", lineUser).is("disabled_at", null).maybeSingle();
  if (!m) return false;
  const w = expenseWords(await profileLang(lineUser));
  if (m.role !== "admin") return send([{ type: "text", text: w.adminOnly }]).then(() => true);
  const c = await loadClaim(admin, p.id);
  if (!c || c.status !== "pending") return send([{ type: "text", text: w.already }]).then(() => true);
  // Only while it still waits: two admins tapping at once decide it once
  const { data: changed, error } = await admin
    .from("expense_claims")
    .update({ status: p.action === "approve" ? "approved" : "rejected", decided_by: m.user_id, decided_at: new Date().toISOString() })
    .eq("id", c.id)
    .eq("status", "pending")
    .select("id");
  if (error) throw error;
  if (!changed?.length) return send([{ type: "text", text: w.already }]).then(() => true);
  await send([{ type: "text", text: fillIn(p.action === "approve" ? w.approved : w.rejected, { name: c.name }) }]);
  await notifyClaimant(c.id).catch(() => false);
  return true;
}

// ── Expense mode: "경비" to the bot, then receipt photos become claims ───────────────────────────────────────────

const MODE_MINUTES = 10;

async function lineMember(lineUser: string) {
  const { data } = await supabaseAdmin().from("members").select("user_id, name, email, home_branch").eq("line_user_id", lineUser).is("disabled_at", null).maybeSingle();
  return data as { user_id: string; name: string; email: string; home_branch: string | null } | null;
}

/** "경비" typed: expense mode for the next minutes (members with an app account only) */
export async function startExpenseMode(lineUser: string, send: Send): Promise<void> {
  const lang = await profileLang(lineUser);
  const m = await lineMember(lineUser);
  if (!m) return send([{ type: "text", text: expenseWords(lang).notMember }]);
  const until = new Date(Date.now() + MODE_MINUTES * 60_000).toISOString();
  const { error } = await supabaseAdmin().from("line_modes").upsert({ line_user_id: lineUser, mode: "expense", until });
  if (error) throw error;
  await send([{ type: "text", text: expenseWords(lang).modeOn }]);
}

export async function inExpenseMode(lineUser: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("line_modes").select("until").eq("line_user_id", lineUser).eq("mode", "expense").maybeSingle();
  return !!data && Date.parse(data.until as string) > Date.now();
}

export type LineClaimResult = { ok: true; text: string; id: string; pending: boolean } | { ok: false; text: string };
type Reading = { ok: true; doc: LedgerDoc } | { ok: false };

/**
 * A receipt photo sent in expense mode → a claim of the member who sent it, in `branchId` (read like an upload; the
 * database approves it by itself when it is under the company's amount). The caller downloaded the photo, checked it
 * is an image and its LINE event is new; `read` reads it.
 */
export async function claimFromLine(lineUser: string, photo: Buffer, type: string, hash: string | null, branchId: string | null, read: (photo: Buffer) => Promise<Reading>): Promise<LineClaimResult> {
  const lang = await profileLang(lineUser);
  const w = expenseWords(lang);
  const m = await lineMember(lineUser);
  if (!m) return { ok: false, text: w.notMember };
  const admin = supabaseAdmin();
  if (hash) {
    const [claims, docs] = await Promise.all([
      admin.from("expense_claims").select("id, photo_hash").neq("status", "rejected").not("photo_hash", "is", null),
      admin.from("documents").select("id, photo_hash").is("deleted_at", null).not("photo_hash", "is", null),
    ]);
    const known = [...(claims.data ?? []), ...(docs.data ?? [])].map((r) => ({ id: r.id as string, hash: r.photo_hash as string }));
    if (findDuplicate(hash, known)) return { ok: false, text: w.dup };
  }
  const r = await read(photo);
  if (!r.ok) return { ok: false, text: w.unreadable };
  const doc = r.doc;
  const amount = docAmount(doc);
  if (!(amount > 0)) return { ok: false, text: w.unreadable };
  const settings = await settingsOf(admin);
  const id = crypto.randomUUID();
  // In the claim's own folder, like the app: once paid back, the ledger document (same id) has its photo
  const path = `${id}/${Date.now()}.${type.split("/")[1].replace("jpeg", "jpg")}`;
  const up = await admin.storage.from("documents").upload(path, photo, { contentType: type });
  if (up.error) throw up.error;
  const seller = doc.seller.name.en || doc.seller.name.th || doc.seller.name.ja || "";
  const { data: row, error } = await admin
    .from("expense_claims")
    .insert({
      id,
      user_id: m.user_id,
      name: (m.name || m.email || "").slice(0, 80),
      ...(branchId ?? m.home_branch ? { branch_id: branchId ?? m.home_branch } : {}),
      day: /^\d{4}-\d{2}-\d{2}$/.test(doc.date) ? doc.date : todayBangkok(),
      seller: seller.slice(0, 120),
      amount,
      category: settings.categories.includes(doc.category) ? doc.category : settings.categories[0],
      doc,
      photo_path: path,
      photo_hash: hash,
      status: "pending",
    })
    .select("id, status")
    .single();
  if (error) throw error;
  const pending = row.status === "pending";
  return { ok: true, id, pending, text: fillIn(pending ? w.sent : w.sentAuto, { amount: bahtWhole(amount / 100), seller: seller || "—" }) };
}
